/**
 * Client helper to capture a website screenshot via the Vite capture
 * middleware, with a shared cache so the canvas preview and export reuse
 * the same bytes for a given url + viewport.
 */

import { CAPTURE_WEBSITE_PATH } from './capturePath';

export { CAPTURE_WEBSITE_PATH };

const BUSY_RETRIES = 2;
const BUSY_RETRY_DELAYS_MS = [500, 1000] as const;

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

function isBusyErrorMessage(message: string): boolean {
  return /too many captures|429/i.test(message);
}

/** Human-friendly message for a failed capture. */
export function describeCaptureError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Could not reach the capture server. Run the app with `npm run dev` (or `npm run preview`).';
  }
  if (/chrome|chromium|executable|launch/i.test(raw)) {
    return 'Could not open Chrome to capture the site. Install google-chrome-stable or set PIXEL_MOCKUP_CHROME.';
  }
  if (/timeout|took too long to load|page\.goto|TimeoutError/i.test(raw)) {
    return 'Site took too long to load (timeout). Try another URL.';
  }
  if (isBusyErrorMessage(raw)) {
    return 'Capture is busy with other devices. Wait a moment and try again.';
  }
  return raw || 'Website capture failed.';
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
    throw new Error(describeCaptureError(err));
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
    throw new Error(describeCaptureError(new Error('invalid capture payload')));
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
      throw new Error(describeCaptureError(new Error(lastError)));
    }
    await sleep(BUSY_RETRY_DELAYS_MS[attempt] ?? 1000);
  }
  throw new Error(describeCaptureError(new Error(lastError)));
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
