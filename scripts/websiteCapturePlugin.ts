import { existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { chromium, type Browser } from 'playwright';
import { CAPTURE_WEBSITE_PATH } from '../src/capturePath.js';
import { isBlockedAddress, normalizeWebsiteUrl } from '../src/websiteUrl.js';

type CaptureBody = {
  url?: string;
  width?: number;
  height?: number;
};

const MAX_VIEWPORT = 4096;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_IN_FLIGHT = 2;

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
  const addrs = await lookup(hostname, { all: true });
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

async function captureWebsite(
  url: string,
  width: number,
  height: number,
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
  try {
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

    // networkidle can hang on sites with long-poll/analytics; fall back to
    // domcontentloaded so SPAs still render, then give the app time to paint.
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    }
    // Final URL must still be public (covers edge cases after navigation).
    await assertPublicHost(page.url());
    // Let fonts / late layout settle, then best-effort dismiss a modal/cookie.
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
    return await page.screenshot({ type: 'png', fullPage: false });
  } finally {
    await context.close();
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
      if (inFlight >= MAX_IN_FLIGHT) {
        respondJson(res, 429, { error: 'too many captures' });
        return;
      }

      inFlight += 1;
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
        const png = await captureWebsite(url, width, height);
        const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
        respondJson(res, 200, { dataUrl });
      } catch (err) {
        console.error('[website-capture]', err);
        respondJson(res, 500, { error: 'capture failed' });
      } finally {
        inFlight -= 1;
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
