import { lookup } from 'node:dns/promises';
import * as cheerio from 'cheerio';
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
};

const FETCH_TIMEOUT_MS = 30_000;
const DNS_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;

// STRICT AUP COMPLIANCE: Lock proxy to your domains only.
const ALLOWED_HOSTNAMES = [
  'pixelmockup.vercel.app',
  'pixelmockup-preview.vercel.app',
  'localhost',
  '127.0.0.1',
  'google.com',
  'www.google.com',
  'example.com',
  'www.example.com',
];

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=30, s-maxage=60',
  'Access-Control-Allow-Origin': '*',
};

const ASSET_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400',
};

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

type JobResult =
  | { error: string }
  | { html: string }
  | { css: string; contentType: string }
  | { binary: Uint8Array; contentType: string };

const pageCache = new Map<string, CachedPage>();
const inFlight = new Map<string, Promise<JobResult>>();
const dnsValidated = new Set<string>();

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
      }
    );
  });
}

function isRequestAuthorized(req: VercelRequest): boolean {
  const host = headerValue(req.headers, 'host');

  if (host) {
    const hostname = host.split(':')[0].toLowerCase();
    if (ALLOWED_HOSTNAMES.includes(hostname)) return true;
  }

  const referer = headerValue(req.headers, 'referer');
  const origin = headerValue(req.headers, 'origin');
  const sourceURL = origin || referer;

  if (sourceURL) {
    try {
      const url = new URL(sourceURL);
      return ALLOWED_HOSTNAMES.includes(url.hostname);
      return true;
    } catch {
      // Ignore the URL
    }
  }
  // If neither the Host nor the Origin/Referer matches our allowed domains,
  // reject the request to prevent it from being used as a public open proxy.
  return false;
}

function headerValue(headers: VercelRequest['headers'], name: string): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

function appOriginFor(host: string | undefined): string {
  if (host && /^[A-Za-z0-9.\-:[\]]+$/.test(host)) return `//${host}`;
  return '';
}

async function assertPublicHost(url: string): Promise<void> {
  const { hostname } = new URL(url);

  // 1. Fast-path check before doing any DNS work
  if (isBlockedAddress(hostname)) throw new Error('blocked host');

  try {
    const addrs = await withTimeout(
      lookup(hostname, { all: true }),
      DNS_TIMEOUT_MS,
      'DNS lookup timed out'
    );

    if (addrs.length === 0 || addrs.some((a: any) => isBlockedAddress(a.address))) {
      throw new Error('blocked host');
    }
  } catch {
    throw new Error('blocked host');
  }
}

function respondJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.json(body);
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

/**
 * ROBUST HTML REWRITER using Cheerio
 * Fixes SRI, srcset, inline styles, and injects critical shims.
 */
function rewriteHtml(html: string, targetUrl: string, appOrigin: string = ''): string {
  const $ = cheerio.load(html);
  const url = new URL(targetUrl);
  const baseHref = new URL('.', url).href;

  // 1. Strip restrictive tags that block our proxy
  $('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="content-security-policy-report-only"], meta[http-equiv="x-frame-options"]').remove();

  // 2. Helper to proxy a URL
  const proxify = (val: string | undefined): string => {
    if (!val) return '';
    val = val.trim();
    if (/^(data|blob|javascript|mailto|tel|about):/i.test(val) || val.startsWith('#')) return val;
    try {
      const resolved = new URL(val, url);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return val;
      if (resolved.hostname !== url.hostname) return val;
      if (resolved.href.includes('/api/proxy?url=')) return val;
      return `${appOrigin}/api/proxy?url=${encodeURIComponent(resolved.href)}`;
    } catch {
      return val;
    }
  };

  // 3. Rewrite standard attributes
  ['src', 'href', 'data', 'poster', 'action', 'formaction'].forEach(attr => {
    $(`[${attr}]`).each((_, el) => {
      const val = $(el).attr(attr);
      if (val) $(el).attr(attr, proxify(val));
    });
  });

  // 4. Rewrite srcset (e.g., <img srcset="img-1x.jpg 1x, img-2x.jpg 2x">)
  $('[srcset]').each((_, el) => {
    const val = $(el).attr('srcset') || '';
    const proxiedSet = val.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s/);
      const urlPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const desc = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);
      return `${proxify(urlPart)}${desc}`;
    }).join(', ');
    $(el).attr('srcset', proxiedSet);
  });

  // 5. Rewrite inline styles (background-image: url(...))
  $('[style]').each((_, el) => {
    let style = $(el).attr('style') || '';
    style = style.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (quote, innerUrl) => {
      return `url(${quote}${proxify(innerUrl)}${quote})`;
    });
    $(el).attr('style', style);
  });

  // 6. CRITICAL: Remove Subresource Integrity (SRI) and crossorigin
  $('script[integrity], link[integrity]').each((_, el) => {
    $(el).removeAttr('integrity');
    $(el).removeAttr('crossorigin');
  });

  // 7. Inject shims at the very top of <head>
  const shims = `
    <base href="${baseHref}">
    <script>
      (function() {
        const realUrl = new URL("${targetUrl}");
        const fakeLoc = {
          href: realUrl.href, protocol: realUrl.protocol, host: realUrl.host,
          hostname: realUrl.hostname, port: realUrl.port, pathname: realUrl.pathname,
          search: realUrl.search, hash: realUrl.hash, origin: realUrl.origin,
          assign: function() {}, replace: function() {}, reload: function() {}
        };
        try { Object.defineProperty(window, 'location', { value: fakeLoc, writable: false, configurable: false }); } catch(e) {}
        if ('serviceWorker' in navigator) { delete navigator.serviceWorker; }
      })();
    </script>
    <script>
      (function() {
        function memoryStore() {
          var data = {};
          return {
            getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
            setItem: function(k, v) { data[String(k)] = String(v); },
            removeItem: function(k) { delete data[String(k)]; },
            clear: function() { data = {}; },
            key: function(i) { var keys = Object.keys(data); return i >= 0 && i < keys.length ? keys[i] : null; },
            get length() { return Object.keys(data).length; }
          };
        }
        function shim(name) {
          var store = memoryStore();
          try { Object.defineProperty(window, name, { configurable: true, get: function() { return store; }, set: function() {} }); } catch(e) {}
        }
        shim('localStorage');
        shim('sessionStorage');
      })();
    </script>
    ${SITE_PROGRESS_SCRIPT}
  `;

  $('head').prepend(shims);

  return $.html();
}

function rewriteCss(css: string, cssUrl: string, appOrigin: string = ''): string {
  const url = new URL(cssUrl);
  const proxify = (val: string): string => {
    try {
      const resolved = new URL(val, url);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return val;
      if (resolved.href.includes('/api/proxy?url=')) return val;
      return `${appOrigin}/api/proxy?url=${encodeURIComponent(resolved.href)}`;
    } catch {
      return val;
    }
  };

  let out = css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, quote, innerUrl) => {
    return `url(${quote}${proxify(innerUrl)}${quote})`;
  });

  out = out.replace(/@import\s+(?:"([^"]*)"|'([^']*)')/gi, (_match, dq, sq) => {
    const value = dq || sq;
    return `@import "${proxify(value)}"`;
  });

  return out;
}

async function readAllBytes(response: Response, capBytes: number): Promise<Uint8Array | null> {
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

async function fetchUpstream(target: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const targetUrlObj = new URL(target);

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': targetUrlObj.origin + '/',
        'Origin': targetUrlObj.origin,
      },
    });

    if (response.url !== target) {
      const { hostname: redirectHost } = new URL(response.url);
      if (isBlockedAddress(redirectHost)) {
        throw new Error('blocked host');
      }
    }
    return response;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vercel serverless web proxy for live iframe preview.
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

  if (!isRequestAuthorized(req)) {
    respondJson(res, 403, { error: 'Forbidden: Proxy is restricted to PixelMockup domains only.' });
    return;
  }

  const raw = parsed.searchParams.get('url') ?? '';
  const target = normalizeWebsiteUrl(raw);

  if (!target) {
    const issue = websiteInputIssue(raw);
    respondJson(res, 400, {
      error: issue === 'blocked_host' ? 'blocked host' : 'invalid or non-http(s) url'
    });
    return;
  }

  const appOrigin = appOriginFor(headerValue(req.headers, 'host'));
  const cacheKey = `${appOrigin}\u0000${target}`;

  const cached = pageCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    pageCache.delete(cacheKey);
    pageCache.set(cacheKey, cached);
    sendCachedHtml(res, cached.html);
    return;
  }
  if (cached) pageCache.delete(cacheKey);

  let job = inFlight.get(cacheKey);
  if (!job) {
    job = (async () => {
      const hostname = new URL(target).hostname;
      if (!dnsValidated.has(hostname)) {
        try {
          await assertPublicHost(target);
          dnsValidated.add(hostname);
        } catch {
          return { error: 'blocked host' as const };
        }
      }

      let response: Response;
      try {
        response = await fetchUpstream(target);
      } catch (err) {
        if (err instanceof Error && err.message === 'blocked host') {
          return { error: 'blocked host' as const };
        }
        return { error: 'fetch failed' as const };
      }

      const contentType = response.headers.get('content-type') ?? '';
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
      const isCss = /text\/css/i.test(contentType);

      if (isHtml) {
        if (contentLength > MAX_BODY_BYTES) return { error: 'page too large' as const };
        const bytes = await readAllBytes(response, MAX_BODY_BYTES);
        if (!bytes) return { error: 'page too large' as const };
        return { html: rewriteHtml(new TextDecoder('utf-8').decode(bytes), target, appOrigin) };
      }

      if (isCss) {
        if (contentLength > MAX_BODY_BYTES) return { error: 'stylesheet too large' as const };
        const bytes = await readAllBytes(response, MAX_BODY_BYTES);
        if (!bytes) return { error: 'stylesheet too large' as const };
        return { css: rewriteCss(new TextDecoder('utf-8').decode(bytes), target, appOrigin), contentType };
      }

      if (contentLength > MAX_BINARY_BYTES) return { error: 'resource too large' as const };
      const bytes = await readAllBytes(response, MAX_BINARY_BYTES);
      if (!bytes) return { error: 'resource too large' as const };
      return { binary: bytes, contentType: contentType || 'application/octet-stream' };
    })();
    inFlight.set(cacheKey, job);
  }

  try {
    const result = await job;
    const isCreator = inFlight.get(cacheKey) === job;

    if (!isCreator) {
      if (result && 'html' in result) {
        sendCachedHtml(res, result.html);
      } else {
        respondJson(res, 502, { error: 'Failed to fetch website' });
      }
      return;
    }

    if (result && 'error' in result) {
      const status = result.error === 'blocked host' ? 400
        : result.error === 'page too large' ? 413
          : result.error === 'stylesheet too large' ? 413
            : result.error === 'resource too large' ? 413
              : 502;
      respondJson(res, status, { error: result.error === 'fetch failed' ? 'Failed to fetch website' : result.error });
      return;
    }

    if (result && 'html' in result) {
      cachePage(cacheKey, result.html);
      sendCachedHtml(res, result.html);
    } else if (result && 'css' in result) {
      res.writeHead(200, { ...ASSET_HEADERS, 'Content-Type': result.contentType });
      res.write(result.css);
      res.end();
    } else if (result && 'binary' in result) {
      res.writeHead(200, { ...ASSET_HEADERS, 'Content-Type': result.contentType });
      res.write(result.binary);
      res.end();
    }
  } catch {
    respondJson(res, 502, { error: 'Failed to fetch website' });
  } finally {
    if (inFlight.get(cacheKey) === job) inFlight.delete(cacheKey);
  }
}

export const config = { maxDuration: 60 };
export function _resetProxyForTesting() {
  pageCache.clear();
  inFlight.clear();
  dnsValidated.clear();
}
export default handler;