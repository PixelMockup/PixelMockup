/**
 * Client helper to capture a website screenshot via the Vite capture
 * middleware, with a shared cache so the canvas preview and export reuse
 * the same bytes for a given url + viewport.
 */

import { CAPTURE_WEBSITE_PATH } from './capturePath';
import { websiteInputIssue } from './websiteUrl';
import {
  type ScreenshotProvider,
  captureWithProvider,
  getScreenshotProvider,
  getScreenshotApiKey,
  getMicrolinkApiKey,
} from './screenshotProviders';

export { CAPTURE_WEBSITE_PATH };

const BUSY_RETRIES = 2;
const BUSY_RETRY_DELAYS_MS = [500, 1000] as const;

const REMEDIATION_UPLOAD =
  'Try a public site that loads without a captcha or login wall, or take your own screenshot and upload it onto the device screens.';

export type CaptureErrorKind =
  | 'blocked_host'
  | 'invalid_url'
  | 'unreachable_server'
  | 'chrome_missing'
  | 'timeout'
  | 'busy'
  | 'forbidden_origin'
  | 'cancelled'
  | 'generic';

export type CaptureNotice = {
  kind: CaptureErrorKind;
  title: string;
  /** What happened */
  body: string;
  /** Why this happens */
  reason: string;
  /** What the user can do next */
  remediation: string;
  /** One-line summary for toasts / a11y. */
  summary: string;
  /** Optional opaque server detail (never the main explanation). */
  technicalDetail?: string;
};

function notice(
  kind: CaptureErrorKind,
  title: string,
  body: string,
  reason: string,
  remediation: string,
  summary: string,
): CaptureNotice {
  return { kind, title, body, reason, remediation, summary };
}

const OPAQUE_SERVER_MESSAGES = new Set([
  'capture failed',
  'invalid capture payload',
  'application/json required',
]);

const NOTICES: Record<CaptureErrorKind, CaptureNotice> = {
  blocked_host: notice(
    'blocked_host',
    'This address can’t be captured',
    'Pixel Mockup refused to open this address for a screenshot.',
    'Private, local, or cloud-metadata hosts are blocked so the capture service can’t be used to probe your network or internal services.',
    REMEDIATION_UPLOAD,
    'That address can’t be captured (private or local host).',
  ),
  invalid_url: notice(
    'invalid_url',
    'Enter a valid website',
    'That text isn’t a usable website address for capture.',
    'The URL must be http or https, with a real hostname, and without embedded login credentials.',
    'Use something like google.com or https://example.com, then apply again — or upload a screenshot if you already have one.',
    'Enter a website (e.g. google.com)',
  ),
  unreachable_server: notice(
    'unreachable_server',
    'Capture isn’t available here',
    'Automatic website screenshots aren’t available on this hosted build.',
    'Capture runs with the Vite server (`npm run dev`, `npm run preview`) or the Docker image (`docker compose up`). Static hosts such as Vercel ship the UI only — no capture endpoint.',
    'Try Settings → Live iframe preview for an on-canvas embed (many sites block it), upload your own screenshot, or run `npm run dev` / `docker compose up` for full capture and export.',
    'Website capture needs a local or Docker run (`npm run dev` or `docker compose up`). On this static host, use live iframe preview or upload a screenshot.',
  ),
  chrome_missing: notice(
    'chrome_missing',
    'Chrome is required to capture sites',
    'The capture service couldn’t open Chrome or Chromium to load the page.',
    'Screenshots are taken in a real browser process. If Chrome isn’t installed or isn’t findable, capture can’t start.',
    'Install google-chrome-stable or set PIXEL_MOCKUP_CHROME to the browser path, then retry. Or upload a manual screenshot instead.',
    'Could not open Chrome to capture the site. Install google-chrome-stable or set PIXEL_MOCKUP_CHROME.',
  ),
  timeout: notice(
    'timeout',
    'This site took too long',
    'The page didn’t finish loading before capture gave up.',
    'Captchas, bot checks, login walls, or a very slow site often delay the page past the capture time limit.',
    REMEDIATION_UPLOAD,
    'Site took too long to load (timeout). Try another URL.',
  ),
  busy: notice(
    'busy',
    'Capture is busy',
    'Too many website captures are already running for other devices.',
    'The capture service limits how many screenshots it takes at once so Chrome stays responsive.',
    'Wait a moment and try again, or upload a screenshot onto the screens.',
    'Capture is busy with other devices. Wait a moment and try again.',
  ),
  forbidden_origin: notice(
    'forbidden_origin',
    'Capture request was blocked',
    'The capture service rejected this request as coming from the wrong place.',
    'For safety, screenshots are only allowed from this app’s own origin while it is running locally.',
    'Use the Pixel Mockup window opened by `npm run dev` or `npm run preview`, then try again. Or upload a screenshot instead.',
    'Capture request was blocked (wrong origin).',
  ),
  cancelled: notice(
    'cancelled',
    'Capture cancelled',
    'This capture was cancelled because a newer request replaced it.',
    'Changing the website URL aborts in-flight captures so they don’t block the queue.',
    'Wait for the new URL to finish loading on the devices.',
    'Capture cancelled.',
  ),
  generic: notice(
    'generic',
    'Couldn’t capture this website',
    'Pixel Mockup couldn’t take an automatic screenshot of this page.',
    'Many sites block automated browsers, show a captcha or login wall, or refuse the capture request — so the service returns a failure instead of a usable image.',
    REMEDIATION_UPLOAD,
    'Website capture failed.',
  ),
};

function isBusyErrorMessage(message: string): boolean {
  return /too many captures|429/i.test(message);
}

function isOpaqueServerMessage(raw: string): boolean {
  return OPAQUE_SERVER_MESSAGES.has(raw.trim().toLowerCase());
}

function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  if (name === 'AbortError') return true;
  const message = 'message' in err ? String(err.message) : '';
  return /aborted|abort(ed)? by user|The operation was aborted/i.test(message);
}

function kindFromMessage(raw: string): CaptureErrorKind {
  const t = raw.trim();
  if (/aborted|abort(ed)? by user|The operation was aborted/i.test(t)) {
    return 'cancelled';
  }
  if (/blocked host/i.test(t)) return 'blocked_host';
  if (/invalid or non-http\(s\) url/i.test(t)) return 'invalid_url';
  if (/forbidden origin/i.test(t)) return 'forbidden_origin';
  if (
    /failed to fetch|networkerror|load failed|capture server unavailable/i.test(
      t,
    )
  ) {
    return 'unreachable_server';
  }
  if (/chrome|chromium|executable|launch/i.test(t)) return 'chrome_missing';
  if (/timeout|took too long to load|page\.goto|TimeoutError/i.test(t)) {
    return 'timeout';
  }
  if (isBusyErrorMessage(t)) return 'busy';
  if (/^capture failed$/i.test(t) || /invalid capture payload/i.test(t)) {
    return 'generic';
  }
  return 'generic';
}

/** Structured notice for dialogs; `summary` stays toast/a11y friendly. */
export function classifyCaptureError(err: unknown): CaptureNotice {
  if (isAbortError(err)) return NOTICES.cancelled;
  const raw = (err instanceof Error ? err.message : String(err)).trim();
  const kind = kindFromMessage(raw);
  const base = NOTICES[kind];

  // Never replace the friendly body with opaque server codes like "capture failed".
  if (!raw || isOpaqueServerMessage(raw) || kind !== 'generic') {
    return base;
  }

  // Unknown but readable message: keep friendly what/why, attach tech detail.
  return {
    ...base,
    technicalDetail: raw,
  };
}

/** Structured notice when the URL field fails validation. */
export function classifyWebsiteInput(input: string): CaptureNotice {
  const issue = websiteInputIssue(input);
  if (issue === 'blocked_host') return NOTICES.blocked_host;
  return NOTICES.invalid_url;
}

/** Human-friendly one-line message for a failed capture. */
export function describeCaptureError(err: unknown): string {
  return classifyCaptureError(err).summary;
}

function cacheKey(url: string, width: number, height: number): string {
  return `${url}|${Math.round(width)}x${Math.round(height)}`;
}

function cloudCacheKey(url: string, width: number, height: number, provider: ScreenshotProvider): string {
  return `${provider}|${url}|${Math.round(width)}x${Math.round(height)}`;
}

/** Callback to update credit counts in the UI. */
let creditUpdateCallback: ((provider: string, remaining: number | null) => void) | null = null;

/** Register a callback for credit updates after each cloud capture. */
export function onCreditsUpdate(cb: (provider: string, remaining: number | null) => void): void {
  creditUpdateCallback = cb;
}

/** Resolved data URLs, keyed by url|WxH (shared by preview + export). */
const captureCache = new Map<string, string>();
/** In-flight requests, so identical viewports capture only once. */
const pending = new Map<string, Promise<string>>();
/** Controllers for in-flight fetches; aborted on cache clear / re-apply. */
const inFlightControllers = new Set<AbortController>();

/**
 * Hosted static builds (Vercel) have no capture middleware. Probe once in
 * production so Apply / N devices don't hammer a missing endpoint.
 * Dev skips the probe — the Vite plugin is always present.
 */
type CaptureEndpointState = 'unknown' | 'available' | 'unavailable';
let captureEndpointState: CaptureEndpointState = 'unknown';
let captureProbeInFlight: Promise<boolean> | null = null;

const CAPTURE_UNAVAILABLE_ERROR = 'capture server unavailable';

function markCaptureUnavailable(): void {
  captureEndpointState = 'unavailable';
}

/** Structured notice when capture is known missing (hosted/static). */
export function captureUnavailableNotice(): CaptureNotice {
  return NOTICES.unreachable_server;
}

export function isCaptureUnavailable(): boolean {
  return captureEndpointState === 'unavailable';
}

/** Test helper — reset the one-shot probe between cases. */
export function resetCaptureAvailabilityForTests(): void {
  captureEndpointState = 'unknown';
  captureProbeInFlight = null;
}

/**
 * Lightweight POST that never launches Chrome: empty body → JSON 400 from the
 * Vite middleware. SPA/static hosts return HTML (or fail to parse as JSON).
 */
async function probeCaptureEndpoint(): Promise<boolean> {
  try {
    const res = await fetch(CAPTURE_WEBSITE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: unknown;
      dataUrl?: unknown;
    } | null;
    return (
      data != null &&
      typeof data === 'object' &&
      ('error' in data || 'dataUrl' in data)
    );
  } catch {
    return false;
  }
}

/**
 * Resolve whether `/__capture_website` exists. Safe to call from Apply before
 * mounting device captures — subsequent calls are free after the first probe.
 * Uses one empty POST (no Chrome) so `vite preview` still detects the plugin
 * while static hosts (Vercel) fail fast.
 */
export async function ensureCaptureAvailable(): Promise<boolean> {
  if (captureEndpointState === 'available') return true;
  if (captureEndpointState === 'unavailable') return false;

  if (!captureProbeInFlight) {
    captureProbeInFlight = probeCaptureEndpoint()
      .then((ok) => {
        captureEndpointState = ok ? 'available' : 'unavailable';
        return ok;
      })
      .finally(() => {
        captureProbeInFlight = null;
      });
  }
  return captureProbeInFlight;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function requestCaptureOnce(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string; busy: boolean }> {
  let res: Response;
  try {
    res = await fetch(CAPTURE_WEBSITE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    // Network failure on a relative same-origin URL usually means the capture
    // route isn't there (or the tab went offline). Remember for siblings.
    markCaptureUnavailable();
    // Keep the raw network error so classifyCaptureError can map it.
    throw err instanceof Error ? err : new Error(String(err));
  }

  const data = (await res.json().catch(() => ({}))) as {
    dataUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.dataUrl) {
    // Static hosts (Vercel) often return HTML 404 for /__capture_website with
    // no JSON error field — treat that as missing capture, not a site failure.
    const error =
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : CAPTURE_UNAVAILABLE_ERROR;
    if (error === CAPTURE_UNAVAILABLE_ERROR) {
      markCaptureUnavailable();
    }
    return {
      ok: false,
      error,
      busy: res.status === 429 || isBusyErrorMessage(error),
    };
  }
  if (!data.dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('invalid capture payload');
  }
  return { ok: true, dataUrl: data.dataUrl };
}

async function requestCapture(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<string> {
  let lastError = 'capture failed';
  for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const result = await requestCaptureOnce(url, width, height, signal);
    if (result.ok) return result.dataUrl;
    lastError = result.error;
    if (!result.busy || attempt === BUSY_RETRIES) {
      throw new Error(lastError);
    }
    await sleep(BUSY_RETRY_DELAYS_MS[attempt] ?? 1000);
  }
  throw new Error(lastError);
}

/**
 * Capture (or reuse cached) screenshot for a url + viewport.
 * Concurrent identical requests share one network call.
 * Routes through cloud providers when selected, otherwise uses local Playwright.
 */
export async function captureOne(
  url: string,
  width: number,
  height: number,
): Promise<string> {
  const provider = getScreenshotProvider();

  if (provider === 'screenshotapi' || provider === 'microlink') {
    return captureCloud(url, width, height, provider);
  }

  // Playwright (local dev)
  if (captureEndpointState === 'unavailable') {
    throw new Error(CAPTURE_UNAVAILABLE_ERROR);
  }
  if (captureEndpointState === 'unknown') {
    const ok = await ensureCaptureAvailable();
    if (!ok) throw new Error(CAPTURE_UNAVAILABLE_ERROR);
  }

  const key = cacheKey(url, width, height);
  const cached = captureCache.get(key);
  if (cached) return cached;

  let p = pending.get(key);
  if (!p) {
    const controller = new AbortController();
    inFlightControllers.add(controller);
    p = requestCapture(url, width, height, controller.signal)
      .then((dataUrl) => {
        captureCache.set(key, dataUrl);
        return dataUrl;
      })
      .finally(() => {
        inFlightControllers.delete(controller);
        pending.delete(key);
      });
    pending.set(key, p);
  }
  return p;
}

/**
 * Capture via a cloud screenshot provider (ScreenshotAPI or Microlink).
 * Uses a separate cache keyed by provider to avoid cross-provider collisions.
 */
async function captureCloud(
  url: string,
  width: number,
  height: number,
  provider: ScreenshotProvider,
): Promise<string> {
  const key = cloudCacheKey(url, width, height, provider);
  const cached = captureCache.get(key);
  if (cached) return cached;

  let p = pending.get(key);
  if (!p) {
    const apiKey = provider === 'screenshotapi' ? getScreenshotApiKey() : getMicrolinkApiKey();
    p = captureWithProvider(url, width, height, provider, apiKey || undefined)
      .then((result) => {
        captureCache.set(key, result.dataUrl);
        if (result.creditsRemaining != null && creditUpdateCallback) {
          creditUpdateCallback(provider, result.creditsRemaining);
        }
        return result.dataUrl;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, p);
  }
  return p;
}

/** Backwards-compatible single capture (now cached). */
export function captureWebsiteScreenshot(
  url: string,
  width: number,
  height: number,
): Promise<string> {
  return captureOne(url, width, height);
}

/** Capture many jobs, reusing the shared cache across preview + export. */
export async function captureWebsiteScreenshotsCached(
  jobs: Array<{ key: string; url: string; width: number; height: number }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    jobs.map(async (job) => {
      const dataUrl = await captureOne(job.url, job.width, job.height);
      out.set(job.key, dataUrl);
    }),
  );
  return out;
}

/** Clear cached captures (e.g. when the user changes the URL). */
export function clearWebsiteCaptureCache(): void {
  for (const controller of inFlightControllers) {
    controller.abort();
  }
  inFlightControllers.clear();
  captureCache.clear();
  pending.clear();
}

/** True when an error is an intentional abort (re-apply / cache clear). */
export function isCaptureAbortError(err: unknown): boolean {
  return isAbortError(err) || classifyCaptureError(err).kind === 'cancelled';
}
