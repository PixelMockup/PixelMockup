/**
 * Client helper to capture a website screenshot via the Vite capture
 * middleware, with a shared cache so the canvas preview and export reuse
 * the same bytes for a given url + viewport.
 */

import { CAPTURE_WEBSITE_PATH } from './capturePath';
import { websiteInputIssue } from './websiteUrl';

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
  | 'generic';

export type CaptureNotice = {
  kind: CaptureErrorKind;
  title: string;
  body: string;
  remediation: string;
  /** One-line summary for toasts / a11y. */
  summary: string;
};

function notice(
  kind: CaptureErrorKind,
  title: string,
  body: string,
  remediation: string,
  summary: string,
): CaptureNotice {
  return { kind, title, body, remediation, summary };
}

const NOTICES: Record<CaptureErrorKind, CaptureNotice> = {
  blocked_host: notice(
    'blocked_host',
    'This address can’t be captured',
    'Private, local, or metadata hosts are blocked for safety, so Pixel Mockup can’t screenshot that URL.',
    REMEDIATION_UPLOAD,
    'That address can’t be captured (private or local host).',
  ),
  invalid_url: notice(
    'invalid_url',
    'Enter a valid website',
    'Use a normal web address such as google.com or https://example.com.',
    'Then apply it again, or upload a screenshot if you already have one.',
    'Enter a website (e.g. google.com)',
  ),
  unreachable_server: notice(
    'unreachable_server',
    'Capture server unavailable',
    'Pixel Mockup couldn’t reach the local capture service that screenshots websites.',
    'Run the app with `npm run dev` or `npm run preview`, then try again. Or upload your own screenshot onto the devices.',
    'Could not reach the capture server. Run the app with `npm run dev` (or `npm run preview`).',
  ),
  chrome_missing: notice(
    'chrome_missing',
    'Chrome is required to capture sites',
    'The capture service couldn’t open Chrome/Chromium to load the page.',
    'Install google-chrome-stable or set PIXEL_MOCKUP_CHROME, then retry. Or upload a manual screenshot instead.',
    'Could not open Chrome to capture the site. Install google-chrome-stable or set PIXEL_MOCKUP_CHROME.',
  ),
  timeout: notice(
    'timeout',
    'This site took too long',
    'The page didn’t finish loading in time. Captchas, bot checks, or very slow pages often cause this.',
    REMEDIATION_UPLOAD,
    'Site took too long to load (timeout). Try another URL.',
  ),
  busy: notice(
    'busy',
    'Capture is busy',
    'Too many website captures are already running for other devices.',
    'Wait a moment and try again, or upload a screenshot onto the screens.',
    'Capture is busy with other devices. Wait a moment and try again.',
  ),
  generic: notice(
    'generic',
    'Couldn’t capture this website',
    'Automatic screenshots aren’t available for this page — many sites block automated browsers or show a challenge.',
    REMEDIATION_UPLOAD,
    'Website capture failed.',
  ),
};

function isBusyErrorMessage(message: string): boolean {
  return /too many captures|429/i.test(message);
}

function kindFromMessage(raw: string): CaptureErrorKind {
  if (/blocked host/i.test(raw)) return 'blocked_host';
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'unreachable_server';
  }
  if (/chrome|chromium|executable|launch/i.test(raw)) return 'chrome_missing';
  if (/timeout|took too long to load|page\.goto|TimeoutError/i.test(raw)) {
    return 'timeout';
  }
  if (isBusyErrorMessage(raw)) return 'busy';
  return 'generic';
}

/** Structured notice for dialogs; `summary` stays toast/a11y friendly. */
export function classifyCaptureError(err: unknown): CaptureNotice {
  const raw = err instanceof Error ? err.message : String(err);
  const kind = kindFromMessage(raw);
  if (kind === 'generic' && raw.trim()) {
    return {
      ...NOTICES.generic,
      body: raw.trim(),
      summary: raw.trim(),
    };
  }
  return NOTICES[kind];
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

/** Resolved data URLs, keyed by url|WxH (shared by preview + export). */
const captureCache = new Map<string, string>();
/** In-flight requests, so identical viewports capture only once. */
const pending = new Map<string, Promise<string>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function requestCaptureOnce(
  url: string,
  width: number,
  height: number,
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
    });
  } catch (err) {
    // Keep the raw network error so classifyCaptureError can map it.
    throw err instanceof Error ? err : new Error(String(err));
  }

  const data = (await res.json().catch(() => ({}))) as {
    dataUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.dataUrl) {
    const error = data.error || 'capture failed';
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
): Promise<string> {
  let lastError = 'capture failed';
  for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
    const result = await requestCaptureOnce(url, width, height);
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
 */
export function captureOne(
  url: string,
  width: number,
  height: number,
): Promise<string> {
  const key = cacheKey(url, width, height);
  const cached = captureCache.get(key);
  if (cached) return Promise.resolve(cached);

  let p = pending.get(key);
  if (!p) {
    p = requestCapture(url, width, height)
      .then((dataUrl) => {
        captureCache.set(key, dataUrl);
        return dataUrl;
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
  captureCache.clear();
  pending.clear();
}
