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
  write: (chunk: string) => void;
  end: (chunk?: string) => void;
  json: (body: unknown) => void;
  send: (body: string) => void;
};

const FETCH_TIMEOUT_MS = 30_000;
const DNS_TIMEOUT_MS = 5_000;
/** Keep well under Vercel's 4.5 MB function response cap. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Buffer until <head> is found so the <base> can be injected mid-stream. */
const STREAM_BUFFER_BYTES = 8 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;
/** DNS is the slowest step of validation — memoize per hostname. */
const VALID_HOST_TTL_MS = 60 * 1000;
const FAILED_HOST_TTL_MS = 5 * 1000;

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

/**
 * Tiny reporter injected into every proxied page. The sandboxed iframe can't
 * be inspected from the app, but it can postMessage its own load progress:
 * phase jumps (fetching → parsing) plus subresource completion (loaded/total)
 * capped at 90% until the load event. No user input is interpolated here.
 */
const SITE_PROGRESS_SCRIPT = `<script>(function () {
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

/** <base> + progress reporter, anchored right after the <head> opens. */
function documentInjection(baseHref: string): string {
  return `<base href="${baseHref}">${SITE_PROGRESS_SCRIPT}`;
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
 * Stream the upstream body to the client, injecting <base> into the first
 * buffered chunk so the iframe renders at TTFB. Accumulates the final
 * injected document for the cache; aborts (partial page) past the size cap.
 * Returns the full injected HTML when it fits, else null.
 */
async function streamHtml(
  res: VercelResponse,
  response: Response,
  baseHref: string,
): Promise<string | null> {
  const body = response.body;
  if (!body) {
    res.end();
    return null;
  }
  const reader = body.getReader();
  // stream:true keeps multi-byte UTF-8 sequences intact across chunk edges.
  const decoder = new TextDecoder('utf-8');
  let buffered = '';
  let injected = false;
  let bytes = 0;
  let acc = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      bytes += value.byteLength;
      if (!injected) {
        buffered += text;
        const head = /<head[^>]*>/i.exec(buffered);
        let payload: string;
        if (head) {
          const at = head.index + head[0].length;
          payload = buffered.slice(0, at) + documentInjection(baseHref) + buffered.slice(at);
          injected = true;
        } else if (Buffer.byteLength(buffered, 'utf8') >= STREAM_BUFFER_BYTES) {
          payload = injectBaseTag(buffered, baseHref);
          injected = true;
        } else {
          continue;
        }
        buffered = '';
        res.write(payload);
        acc = payload;
      } else {
        res.write(text);
        acc += text;
      }
      if (bytes > MAX_BODY_BYTES) {
        res.end();
        return null;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!injected) {
    const payload = injectBaseTag(buffered, baseHref);
    res.write(payload);
    acc = payload;
  }
  res.end();
  return acc;
}

/**
 * Fetch + validate + stream the target into `res`. Returns the full injected
 * HTML for caching (or null). Writes its own error JSON for validation
 * failures; callers awaiting the in-flight promise can't reproduce those, so
 * they fall back to a generic 502.
 */
async function fetchAndStream(
  target: string,
  res: VercelResponse,
): Promise<string | null> {
  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetch(target, {
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    respondJson(res, 502, {
      error: 'Failed to fetch website',
      ...(err instanceof Error ? { technicalDetail: err.message } : {}),
    });
    return null;
  }

  // A redirect may have moved us somewhere private — re-check the final URL.
  if (response.url !== target) {
    try {
      await assertPublicHost(response.url);
    } catch {
      respondJson(res, 400, { error: 'blocked host' });
      return null;
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    respondJson(res, 415, { error: 'unsupported content type' });
    return null;
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    respondJson(res, 413, { error: 'page too large' });
    return null;
  }

  res.writeHead(200, HTML_HEADERS);
  try {
    return await streamHtml(res, response, baseHrefFor(target));
  } catch {
    // Client disconnected mid-stream — nothing more to send. Signal "no
    // cacheable page" so concurrent in-flight waiters get a clean 502
    // instead of a rejected promise killing every device.
    try {
      res.end();
    } catch {
      // Already gone.
    }
    return null;
  }
}

/**
 * Vercel serverless HTML proxy for live iframe preview on static hosts.
 * GET /api/proxy?url=<encoded>&probe=1 → { ok: true } (availability probe)
 * GET /api/proxy?url=<encoded>          → 200 streamed text/html with <base>
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
  const referer = headerValue(req.headers, 'referer');
  if (referer) {
    const host = headerValue(req.headers, 'host');
    let allowed = false;
    try {
      allowed = Boolean(host && new URL(referer).host === host);
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
  const cached = pageCache.get(target);
  if (cached && cached.expires > Date.now()) {
    // Refresh LRU position. Cache hits skip DNS entirely.
    pageCache.delete(target);
    pageCache.set(target, cached);
    sendCachedHtml(res, cached.html);
    return;
  }
  if (cached) pageCache.delete(target);

  // Dedupe the whole job (DNS validation + upstream fetch + stream) so
  // concurrent devices share one request — registered before the first
  // await so no two requests can slip past the check.
  let job = inFlight.get(target);
  if (!job) {
    job = (async () => {
      try {
        await assertPublicHost(target);
      } catch {
        respondJson(res, 400, { error: 'blocked host' });
        return null;
      }
      return fetchAndStream(target, res);
    })();
    inFlight.set(target, job);
  }

  try {
    const html = await job;
    // The creator's response was written by the job itself (stream or error
    // JSON); joined requests must answer their own device.
    const isCreator = inFlight.get(target) === job;
    if (html) {
      if (isCreator) cachePage(target, html);
      else sendCachedHtml(res, html);
    } else if (!isCreator) {
      respondJson(res, 502, { error: 'Failed to fetch website' });
    }
  } catch {
    // A streaming writer may have disconnected mid-way; never let its
    // rejection cascade into this device's response.
    respondJson(res, 502, { error: 'Failed to fetch website' });
  } finally {
    if (inFlight.get(target) === job) inFlight.delete(target);
  }
}

export const config = { maxDuration: 60 };

export default handler;
