import { appendFileSync, existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { chromium, type Browser } from 'playwright';
import { CAPTURE_WEBSITE_PATH } from '../src/capturePath.js';
import { isBlockedAddress, normalizeWebsiteUrl } from '../src/websiteUrl.js';

const DEBUG_LOG_PATH =
  '/home/ravijaanthony/Documents/dev/Mockup_Studio/.cursor/debug-741bd0.log';

function debugAgentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  try {
    appendFileSync(
      DEBUG_LOG_PATH,
      `${JSON.stringify({
        sessionId: '741bd0',
        location,
        message,
        data,
        timestamp: Date.now(),
        hypothesisId,
      })}\n`,
    );
  } catch {
    /* ignore debug log I/O errors */
  }
  // #endregion
}

type CaptureBody = {
  url?: string;
  width?: number;
  height?: number;
};

const MAX_VIEWPORT = 4096;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_IN_FLIGHT = 4;
const DNS_LOOKUP_TIMEOUT_MS = 5_000;
const GOTO_TIMEOUT_MS = 20_000;

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

/** Common Google Chrome / Chromium locations across distros. */
const CHROME_CANDIDATES = [
  process.env.PIXEL_MOCKUP_CHROME,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/opt/google/chrome/chrome',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

function resolveChromePath(): string | null {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function allowPrivateHosts(): boolean {
  return process.env.PIXEL_MOCKUP_ALLOW_PRIVATE_HOSTS === '1';
}

function disableSandbox(): boolean {
  return process.env.PIXEL_MOCKUP_DISABLE_SANDBOX === '1';
}

let browserPromise: Promise<Browser> | null = null;
let inFlight = 0;
const captureWaiters: Array<() => void> = [];

async function acquireCaptureSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }
  // Wait until releaseCaptureSlot transfers a free slot to this waiter.
  await new Promise<void>((resolve) => {
    captureWaiters.push(resolve);
  });
}

function releaseCaptureSlot(): void {
  const next = captureWaiters.shift();
  if (next) {
    // Hand the slot to the next waiter; keep inFlight the same.
    next();
    return;
  }
  inFlight = Math.max(0, inFlight - 1);
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = resolveChromePath();
    const args = ['--disable-dev-shm-usage'];
    if (disableSandbox()) args.unshift('--no-sandbox');
    browserPromise = chromium
      .launch({
        headless: true,
        // Prefer the system browser (Fedora RPM etc.); fall back to any
        // Playwright-managed Chromium if no system install is found.
        ...(executablePath ? { executablePath } : {}),
        args,
      })
      .catch((err) => {
        // Reset so a later request can retry (e.g. after installing Chrome).
        browserPromise = null;
        const hint = executablePath
          ? `Failed to launch Chrome at ${executablePath}.`
          : 'No system Chrome/Chromium found. Install google-chrome-stable or set PIXEL_MOCKUP_CHROME.';
        throw new Error(
          `${hint} ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
  return browserPromise;
}

async function assertPublicHost(url: string): Promise<void> {
  if (allowPrivateHosts()) return;
  const { hostname } = new URL(url);
  if (isBlockedAddress(hostname)) {
    throw new Error('blocked host');
  }
  const addrs = await withTimeout(
    lookup(hostname, { all: true }),
    DNS_LOOKUP_TIMEOUT_MS,
    'dns lookup timeout',
  );
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) {
    throw new Error('blocked host');
  }
}

function clampViewport(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > MAX_VIEWPORT) return null;
  return rounded;
}

function isClientAborted(req: IncomingMessage): boolean {
  return Boolean(req.aborted || req.destroyed);
}

function isGotoTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  if (name === 'TimeoutError') return true;
  const message = 'message' in err ? String(err.message) : '';
  return /TimeoutError|timeout/i.test(message);
}

async function captureWebsite(
  url: string,
  width: number,
  height: number,
  res: ServerResponse,
): Promise<Buffer> {
  const browser = await getBrowser();
  // Fresh context with a desktop UA so responsive shells (sidebars) match a
  // real laptop browser instead of headless-Chrome defaults.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  let abortedByClient = false;
  const abortCapture = () => {
    if (abortedByClient) return;
    abortedByClient = true;
    // #region agent log
    debugAgentLog(
      'websiteCapturePlugin.ts:abort',
      'client disconnected; aborting capture',
      { url, width, height },
      'H1',
    );
    // #endregion
    void page.close().catch(() => undefined);
    void context.close().catch(() => undefined);
  };
  // Detect genuine client disconnect via the response stream — not the
  // request. After readJsonBody, req is no longer readable and often fires
  // 'close', which falsely aborted every capture.
  const onResClose = () => {
    if (!res.writableFinished) {
      abortCapture();
    }
  };
  res.on('close', onResClose);
  try {
    if (abortedByClient) {
      throw new Error('client aborted');
    }
    // Re-check every request (including redirects) against the SSRF denylist.
    await page.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      if (!/^https?:/i.test(reqUrl)) {
        await route.continue();
        return;
      }
      try {
        await assertPublicHost(reqUrl);
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });

    // Prefer domcontentloaded: networkidle rarely completes on modern SPAs
    // (analytics/long-poll) and burned an extra 20s before the fallback.
    // One TimeoutError retry: intermittent after queue wait (H2).
    const gotoOpts = {
      waitUntil: 'domcontentloaded' as const,
      timeout: GOTO_TIMEOUT_MS,
    };
    try {
      await page.goto(url, gotoOpts);
    } catch (err) {
      if (abortedByClient) {
        throw new Error('client aborted');
      }
      if (!isGotoTimeoutError(err)) throw err;
      // #region agent log
      debugAgentLog(
        'websiteCapturePlugin.ts:gotoRetry',
        'page.goto timed out; retrying once',
        {
          url,
          width,
          height,
          errorMessage: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : '',
        },
        'H2',
      );
      // #endregion
      await page.goto(url, gotoOpts);
    }
    if (abortedByClient) {
      throw new Error('client aborted');
    }
    // Final URL must still be public (covers edge cases after navigation).
    await assertPublicHost(page.url());
    // Let fonts / late layout settle, then best-effort dismiss a modal/cookie.
    await page.waitForTimeout(900);
    if (abortedByClient) {
      throw new Error('client aborted');
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
    if (abortedByClient) {
      throw new Error('client aborted');
    }
    return await page.screenshot({ type: 'png', fullPage: false });
  } finally {
    res.off('close', onResClose);
    await context.close().catch(() => undefined);
  }
}

function readJsonBody(req: IncomingMessage): Promise<CaptureBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(err);
    };

    req.on('data', (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        fail(new Error('body too large'));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw) as CaptureBody);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function respondJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers.host;
  if (!host) return false;
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch {
    return false;
  }
}

/**
 * Vite middleware: POST /__capture_website { url, width, height }
 * → { dataUrl: "data:image/png;base64,..." }
 */
export function websiteCapturePlugin(): Plugin {
  const attach = (server: {
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
  }) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith(CAPTURE_WEBSITE_PATH) || req.method !== 'POST') {
        next();
        return;
      }

      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.toLowerCase().startsWith('application/json')) {
        respondJson(res, 415, { error: 'application/json required' });
        return;
      }
      if (!isSameOrigin(req)) {
        respondJson(res, 403, { error: 'forbidden origin' });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const rawUrl = typeof body.url === 'string' ? body.url : '';
        const url = normalizeWebsiteUrl(rawUrl);
        const width = clampViewport(Number(body.width));
        const height = clampViewport(Number(body.height));
        if (!url) {
          respondJson(res, 400, { error: 'invalid or non-http(s) url' });
          return;
        }
        if (width == null || height == null) {
          respondJson(res, 400, {
            error: `width and height required (1–${MAX_VIEWPORT})`,
          });
          return;
        }
        try {
          await assertPublicHost(url);
        } catch {
          respondJson(res, 400, { error: 'blocked host' });
          return;
        }

        // #region agent log
        const waitStart = Date.now();
        const inFlightBefore = inFlight;
        const waitersBefore = captureWaiters.length;
        // #endregion
        await acquireCaptureSlot();
        // #region agent log
        const waitMs = Date.now() - waitStart;
        const captureStart = Date.now();
        // #endregion
        try {
          const png = await captureWebsite(url, width, height, res);
          // #region agent log
          debugAgentLog(
            'websiteCapturePlugin.ts:capture',
            'capture finished',
            {
              url,
              width,
              height,
              waitMs,
              inFlightBefore,
              waitersBefore,
              durationMs: Date.now() - captureStart,
              outcome: 'success',
            },
            'H1,H2,H5',
          );
          // #endregion
          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
          respondJson(res, 200, { dataUrl });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : '';
          const clientAborted =
            /client aborted/i.test(msg) || isClientAborted(req);
          // #region agent log
          debugAgentLog(
            'websiteCapturePlugin.ts:capture',
            'capture finished',
            {
              url,
              width,
              height,
              waitMs,
              inFlightBefore,
              waitersBefore,
              durationMs: Date.now() - captureStart,
              outcome: clientAborted ? 'aborted' : 'error',
              errorMessage: msg,
              errorName: name,
            },
            'H1,H2,H5',
          );
          // #endregion
          if (clientAborted) {
            // Genuine client disconnect — not a timeout. Prefer 499 if still
            // writable; otherwise the socket is already gone.
            if (!res.writableEnded) {
              respondJson(res, 499, { error: 'client aborted' });
            }
          } else if (res.writableEnded) {
            // Response already closed.
          } else if (
            name === 'TimeoutError' ||
            /timeout|page\.goto|dns lookup timeout/i.test(msg)
          ) {
            console.error('[website-capture]', err);
            respondJson(res, 504, {
              error:
                'Site took too long to load (timeout). Try another URL.',
            });
          } else {
            console.error('[website-capture]', err);
            respondJson(res, 500, { error: 'capture failed' });
          }
        } finally {
          releaseCaptureSlot();
        }
      } catch (err) {
        console.error('[website-capture]', err);
        respondJson(res, 500, { error: 'capture failed' });
      }
    });
  };

  return {
    name: 'pixel-mockup-website-capture',
    configureServer(server) {
      attach(server);
    },
    configurePreviewServer(server) {
      attach(server);
    },
    async buildEnd() {
      if (browserPromise) {
        const b = await browserPromise.catch(() => null);
        browserPromise = null;
        await b?.close().catch(() => undefined);
      }
    },
  };
}
