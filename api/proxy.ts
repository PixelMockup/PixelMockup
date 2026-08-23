import { lookup } from 'node:dns/promises';
import {
  isBlockedAddress,
  normalizeWebsiteUrl,
  websiteInputIssue,
} from '../src/websiteUrl.js';

type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string | Uint8Array) => void;
  end: (chunk?: string) => void;
  json: (body: unknown) => void;
  send: (body: string) => void;
};

const FETCH_TIMEOUT_MS = 30_000;
const DNS_TIMEOUT_MS = 5_000;
/** Keep well under Vercel's 4.5 MB function response cap (HTML + CSS). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Binary assets (images, fonts, media) may be a bit larger. */
const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;
/** DNS is the slowest step of validation — memoize per hostname. */
const VALID_HOST_TTL_MS = 60 * 1000;
const FAILED_HOST_TTL_MS = 5 * 1000;

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=30, s-maxage=60',
};

/** Subresources (CSS/JS/images/fonts) get a long CDN cache — one function
 *  invocation per unique asset, then Vercel's CDN serves the rest. */
const ASSET_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=60, s-maxage=3600',
};

/** The upstream fetch comes from a Vercel datacenter with no browser identity.
 *  A realistic UA/Accept set stops sites from serving a stripped-down or
 *  bot-blocked variant (which renders "zoomed in"/broken in a device frame). */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Runs first inside every proxied page, before any site script. The iframe is
 * sandboxed without `allow-same-origin` (so proxied sites can never touch the
 * app's real storage), but that makes the site's own localStorage/sessionStorage/
 * cookie access THROW SecurityError and crash its boot scripts. These in-memory
 * shims keep those APIs working within the page only.
 */
const SITE_STORAGE_SHIM = `<script id="ms-storage-shim">(function () {
  function memoryStore() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = {}; },
      key: function (i) { var keys = Object.keys(data); return i >= 0 && i < keys.length ? keys[i] : null; },
      get length() { return Object.keys(data).length; }
    };
  }
  function shim(name) {
    var store = memoryStore();
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return store; },
        set: function () {}
      });
    } catch (e) {}
  }
  shim('localStorage');
  shim('sessionStorage');
  var cookies = '';
  try {
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      get: function () { return cookies; },
      set: function (v) { cookies = String(v); }
    });
  } catch (e) {}
})();</script>`;

/**
 * Tiny reporter injected into every proxied page. The sandboxed iframe can't
 * be inspected from the app, but it can postMessage its own load progress:
 * phase jumps (fetching → parsing) plus subresource completion (loaded/total)
 * capped at 90% until the load event. No user input is interpolated here.
 */
const SITE_PROGRESS_SCRIPT = `<script id="ms-site-progress">(function () {
  var P = '__msSiteProgress';
  var last = 0;
  function post(pct, phase) {
    var now = Date.now();
    if (pct < 100 && now - last < 250) return;
    last = now;
    try { parent.postMessage({ marker: P, phase: phase, pct: pct }, '*'); } catch (e) {}
  }
  function start() {
    try {
      var total = 0;
      var done = 0;
      function bump() {
        if (total > 0) post(Math.min(90, 35 + Math.round(55 * (done / total))), 'parsing');
      }
      function onload() { done++; bump(); }
      function track(root) {
        var els = root.querySelectorAll('img,script,link[rel="stylesheet"],iframe,video,audio,source,object,embed');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.getAttribute('data-ms-tracked') === '1') continue;
          if (el.tagName === 'LINK' && el.getAttribute('rel') !== 'stylesheet') continue;
          el.setAttribute('data-ms-tracked', '1');
          total++;
          if (el.tagName === 'IMG' && el.complete) done++;
          else if (el.tagName === 'LINK' && el.sheet) done++;
          else { el.addEventListener('load', onload, true); el.addEventListener('error', onload, true); }
        }
        bump();
      }
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var nodes = muts[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j].nodeType === 1) track(nodes[j]);
          }
        }
      }).observe(document, { childList: true, subtree: true });
      track(document);
      post(10, 'fetching');
      document.addEventListener('DOMContentLoaded', function () { post(35, 'parsing'); });
      window.addEventListener('load', function () { post(100, 'done'); });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();</script>`;

type CachedPage = { html: string; expires: number };
type ValidatedHost = { ok: boolean; expires: number };

/** Per-warm-instance cache (dedupes within one instance; CDN headers dedupe across all). */
const pageCache = new Map<string, CachedPage>();
/** Concurrent same-URL requests share one upstream fetch. */
const inFlight = new Map<string, Promise<string | null>>();
/** Host validation results, so concurrent devices share one DNS lookup. */
const hostValidation = new Map<string, ValidatedHost>();

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function headerValue(
  headers: VercelRequest['headers'],
  name: string,
): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Reject private/local/metadata hosts, including hosts whose DNS resolves to
 * them (DNS-rebinding guard). Mirrors the capture plugin's check so the proxy
 * can't be used to probe internal networks.
 */
async function assertPublicHost(url: string): Promise<void> {
  const { hostname } = new URL(url);
  const cached = hostValidation.get(hostname);
  if (cached && cached.expires > Date.now()) {
    if (cached.ok) return;
    throw new Error('blocked host');
  }
  if (isBlockedAddress(hostname)) {
    throw new Error('blocked host');
  }
  let ok = false;
  try {
    const addrs = await withTimeout(
      lookup(hostname, { all: true }),
      DNS_TIMEOUT_MS,
      'dns lookup timeout',
    );
    ok = addrs.length > 0 && addrs.every((a) => !isBlockedAddress(a.address));
  } finally {
    // Cache failures briefly so a flaky resolver doesn't stall every request.
    hostValidation.set(hostname, {
      ok,
      expires: Date.now() + (ok ? VALID_HOST_TTL_MS : FAILED_HOST_TTL_MS),
    });
  }
  if (!ok) throw new Error('blocked host');
}

function respondJson(
  res: VercelResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.json(body);
}

/**
 * The proxied document loads from the app's own origin, so relative URLs
 * would resolve against the app unless we anchor them to the target site.
 * The first <base> element wins per spec — inject ours before any existing
 * one (or synthesize a <head> when the page has none).
 */
function injectBaseTag(html: string, baseHref: string): string {
  const injection = documentInjection(baseHref);
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + injection + html.slice(at);
  }
  const root = /<html[^>]*>/i.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return html.slice(0, at) + `<head>${injection}</head>` + html.slice(at);
  }
  return injection + html;
}

/** Directory-relative base so links like ./x resolve as the author intended. */
function baseHrefFor(url: string): string {
  return new URL('.', url).href;
}

/** <base> + storage shim + progress reporter, anchored right after <head>. */
function documentInjection(baseHref: string): string {
  return `<base href="${baseHref}">${SITE_STORAGE_SHIM}${SITE_PROGRESS_SCRIPT}`;
}

function sendCachedHtml(res: VercelResponse, html: string): void {
  res.writeHead(200, HTML_HEADERS);
  res.write(html);
  res.end();
}

function cachePage(target: string, html: string): void {
  pageCache.delete(target);
  pageCache.set(target, { html, expires: Date.now() + CACHE_TTL_MS });
  if (pageCache.size > CACHE_MAX_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest != null) pageCache.delete(oldest);
  }
}

const PROXY_PREFIX = '/api/proxy?url=';

/**
 * The app's own origin as a protocol-relative prefix (e.g. `//app.vercel.app`),
 * taken from the Host header of the proxied request. Rewritten resource URLs
 * must be absolute: the injected <base href="https://site/"> would otherwise
 * re-anchor a root-relative /api/proxy URL onto the TARGET site, breaking it.
 * Only simple host/port characters are accepted; anything else falls back to
 * a relative URL (which still works when no <base> can interfere — tests).
 */
function appOriginFor(host: string | undefined): string {
  if (host && /^[A-Za-z0-9.\-:[\]]+$/.test(host)) return `//${host}`;
  return '';
}

/**
 * Rewrite a single resource URL to route it through our same-origin proxy, or
 * return null to leave it untouched. Only same-host http(s) URLs are proxied —
 * third-party hosts (CDNs, Google Fonts) already send CORS headers, and this
 * keeps Vercel function invocations proportional to the site's own assets.
 */
function rewriteResourceUrl(
  value: string,
  base: URL,
  appOrigin: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(trimmed)) {
    return null;
  }
  if (trimmed.includes('/api/proxy?url=')) return null; // already proxied
  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  if (resolved.hostname !== base.hostname) return null;
  return `${appOrigin}${PROXY_PREFIX}${encodeURIComponent(resolved.href)}`;
}

const REWRITE_ATTR_RE =
  /\b(src|href|data|poster|action|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

function rewriteSrcset(value: string, base: URL, appOrigin: string): string {
  const parts = value.split(',');
  const out = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return part;
    const sp = trimmed.search(/\s/);
    const url = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const desc = sp === -1 ? '' : trimmed.slice(sp);
    const rw = rewriteResourceUrl(url, base, appOrigin);
    return rw == null ? part : rw + desc;
  });
  return out.join(', ');
}

function rewriteAttrs(attrs: string, base: URL, appOrigin: string): string {
  return attrs.replace(REWRITE_ATTR_RE, (m, name, _quote, dq, sq, bare) => {
    const value = (dq ?? sq ?? bare ?? '').trim();
    if (!value) return m;
    const quote = dq != null ? '"' : sq != null ? "'" : '';
    if (name.toLowerCase() === 'srcset') {
      if (/\bdata:/i.test(value)) return m;
      const joined = rewriteSrcset(value, base, appOrigin);
      if (joined === value) return m;
      return `${name}=${quote}${joined}${quote}`;
    }
    const rw = rewriteResourceUrl(value, base, appOrigin);
    if (rw == null) return m;
    return `${name}=${quote}${rw}${quote}`;
  });
}

/**
 * Rewrite same-host subresource URLs in the target HTML so they load from our
 * origin (fonts, `crossorigin` scripts and CSS url()s would otherwise be
 * CORS-blocked once the document's origin changes). Also strips the target's
 * own CSP meta tags — they'd block our injected scripts under the new origin.
 */
function rewriteHtml(html: string, baseHref: string, appOrigin: string): string {
  const base = new URL(baseHref);
  html = html.replace(/<meta\b[^>]*>/gi, (tag) =>
    /http-equiv\s*=\s*("|')?\s*content-security-policy(\b|-report-only)?/i.test(
      tag,
    )
      ? ''
      : tag,
  );
  return html.replace(
    /<(script|link|img|source|iframe|video|audio|object|embed|form|a)\b([^>]*)>/gi,
    (_tag, name: string, attrs: string) =>
      `<${name}${rewriteAttrs(attrs, base, appOrigin)}>`,
  );
}

/**
 * Rewrite url(...) / @import references inside a proxied same-host stylesheet
 * (e.g. FontAwesome webfonts) through the proxy as well.
 */
function rewriteCss(css: string, cssUrl: string, appOrigin: string): string {
  const base = new URL(cssUrl);
  let out = css.replace(
    /url\(\s*("([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
    (m, _quote, dq, sq, bare) => {
      const value = (dq ?? sq ?? bare ?? '').trim();
      const rw = rewriteResourceUrl(value, base, appOrigin);
      if (rw == null) return m;
      const quote = dq != null ? '"' : sq != null ? "'" : '';
      return `url(${quote}${rw}${quote})`;
    },
  );
  out = out.replace(
    /@import\s+(?:"([^"]*)"|'([^']*)')/gi,
    (m, dq: string | undefined, sq: string | undefined) => {
      const value = (dq ?? sq ?? '').trim();
      const rw = rewriteResourceUrl(value, base, appOrigin);
      if (rw == null) return m;
      return `@import "${rw}"`;
    },
  );
  return out;
}

/** Read the upstream body into memory, null when it exceeds the cap. */
async function readAllBytes(
  response: Response,
  capBytes: number,
): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > capBytes) return null;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function safeSend(
  res: VercelResponse,
  status: number,
  headers: Record<string, string>,
  body: string | Uint8Array,
): void {
  try {
    res.writeHead(status, headers);
    res.write(body);
    res.end();
  } catch {
    // Client went away mid-write — nothing left to do.
  }
}

class UpstreamError extends Error {
  kind: 'network' | 'blocked';
  constructor(message: string, kind: 'network' | 'blocked' = 'network') {
    super(message);
    this.kind = kind;
  }
}

/** Shared upstream fetch: timeout + browser-like headers + redirect re-check. */
async function fetchUpstream(target: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    // A redirect may have moved us somewhere private — re-check the final URL.
    if (response.url !== target) {
      try {
        await assertPublicHost(response.url);
      } catch {
        throw new UpstreamError('blocked host', 'blocked');
      }
    }
    return response;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(
      err instanceof Error ? err.message : 'fetch failed',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + validate + rewrite the target into `res`.
 *  - text/html   → rewritten + injected document (cached in memory)
 *  - text/css    → url(...) rewritten stylesheet (CDN-cached)
 *  - everything  → opaque byte passthrough (CDN-cached)
 * Returns the full injected HTML for caching, else null. Writes its own error
 * JSON for validation failures; callers awaiting the in-flight promise can't
 * reproduce those, so they fall back to a generic 502.
 */
async function fetchAndStream(
  target: string,
  res: VercelResponse,
  appOrigin: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchUpstream(target);
  } catch (err) {
    if (err instanceof UpstreamError && err.kind === 'blocked') {
      respondJson(res, 400, { error: 'blocked host' });
    } else {
      respondJson(res, 502, {
        error: 'Failed to fetch website',
        ...(err instanceof Error ? { technicalDetail: err.message } : {}),
      });
    }
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
  const isCss = /text\/css/i.test(contentType);

  if (isHtml) {
    if (contentLength > MAX_BODY_BYTES) {
      respondJson(res, 413, { error: 'page too large' });
      return null;
    }
    const bytes = await readAllBytes(response, MAX_BODY_BYTES);
    if (!bytes) {
      respondJson(res, 413, { error: 'page too large' });
      return null;
    }
    const baseHref = baseHrefFor(target);
    const html = injectBaseTag(
      rewriteHtml(
        new TextDecoder('utf-8').decode(bytes),
        baseHref,
        appOrigin,
      ),
      baseHref,
    );
    safeSend(res, 200, HTML_HEADERS, html);
    return html;
  }

  if (isCss) {
    if (contentLength > MAX_BODY_BYTES) {
      respondJson(res, 413, { error: 'stylesheet too large' });
      return null;
    }
    const bytes = await readAllBytes(response, MAX_BODY_BYTES);
    if (!bytes) {
      respondJson(res, 413, { error: 'stylesheet too large' });
      return null;
    }
    const css = rewriteCss(
      new TextDecoder('utf-8').decode(bytes),
      target,
      appOrigin,
    );
    safeSend(res, 200, { ...ASSET_HEADERS, 'Content-Type': contentType }, css);
    return null;
  }

  // Binary passthrough: images, fonts, scripts, media, …
  if (contentLength > MAX_BINARY_BYTES) {
    respondJson(res, 413, { error: 'resource too large' });
    return null;
  }
  const bytes = await readAllBytes(response, MAX_BINARY_BYTES);
  if (!bytes) {
    respondJson(res, 413, { error: 'resource too large' });
    return null;
  }
  safeSend(
    res,
    200,
    {
      ...ASSET_HEADERS,
      'Content-Type': contentType || 'application/octet-stream',
    },
    bytes,
  );
  return null;
}

/**
 * Vercel serverless web proxy for live iframe preview on static hosts.
 * GET /api/proxy?url=<encoded>&probe=1 → { ok: true } (availability probe)
 * GET /api/proxy?url=<encoded>          → rewritten HTML/CSS or binary bytes
 */
export async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const parsed = new URL(req.url ?? '/', 'http://local');
  if (parsed.searchParams.has('probe')) {
    respondJson(res, 200, { ok: true });
    return;
  }

  // Best-effort: only the app's own origin may use the proxy. The Origin
  // header is absent for iframe navigations, so fall back to Referer.
  // Compare hostnames only — ports/aliases drift in production.
  const referer = headerValue(req.headers, 'referer');
  if (referer) {
    const host = headerValue(req.headers, 'host');
    let allowed = false;
    try {
      allowed = Boolean(
        host &&
          new URL(referer).hostname === new URL(`http://${host}`).hostname,
      );
    } catch {
      allowed = false;
    }
    if (!allowed) {
      respondJson(res, 403, { error: 'forbidden origin' });
      return;
    }
  }

  const raw = parsed.searchParams.get('url') ?? '';
  const target = normalizeWebsiteUrl(raw);
  if (!target) {
    const issue = websiteInputIssue(raw);
    respondJson(res, 400, {
      error:
        issue === 'blocked_host'
          ? 'blocked host'
          : 'invalid or non-http(s) url',
    });
    return;
  }
  // Absolute proxy URLs embedded in the rewritten page must point at the app
  // origin the browser is actually on (the injected <base> would otherwise
  // re-anchor relative paths onto the target site).
  const appOrigin = appOriginFor(headerValue(req.headers, 'host'));
  const key = `${appOrigin}\u0000${target}`;
  const cached = pageCache.get(key);
  if (cached && cached.expires > Date.now()) {
    // Refresh LRU position. Cache hits skip DNS entirely.
    pageCache.delete(key);
    pageCache.set(key, cached);
    sendCachedHtml(res, cached.html);
    return;
  }
  if (cached) pageCache.delete(key);

  // Dedupe the whole job (DNS validation + upstream fetch + rewrite) so
  // concurrent devices share one request — registered before the first
  // await so no two requests can slip past the check.
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      try {
        await assertPublicHost(target);
      } catch {
        respondJson(res, 400, { error: 'blocked host' });
        return null;
      }
      return fetchAndStream(target, res, appOrigin);
    })();
    inFlight.set(key, job);
  }

  try {
    const html = await job;
    // The creator's response was written by the job itself (stream or error
    // JSON); joined requests must answer their own device.
    const isCreator = inFlight.get(key) === job;
    if (html) {
      if (isCreator) cachePage(key, html);
      else sendCachedHtml(res, html);
    } else if (!isCreator) {
      respondJson(res, 502, { error: 'Failed to fetch website' });
    }
  } catch {
    // A streaming writer may have disconnected mid-way; never let its
    // rejection cascade into this device's response.
    respondJson(res, 502, { error: 'Failed to fetch website' });
  } finally {
    if (inFlight.get(key) === job) inFlight.delete(key);
  }
}

export const config = { maxDuration: 60 };

export default handler;
