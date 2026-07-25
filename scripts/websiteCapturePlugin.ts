import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';
import { chromium, type Browser } from 'playwright';
import { CAPTURE_WEBSITE_PATH } from '../src/capturePath.js';

type CaptureBody = {
  url?: string;
  width?: number;
  height?: number;
};

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

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = resolveChromePath();
    browserPromise = chromium
      .launch({
        headless: true,
        // Prefer the system browser (Fedora RPM etc.); fall back to any
        // Playwright-managed Chromium if no system install is found.
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
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

async function captureWebsite(
  url: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const browser = await getBrowser();
  // Fresh context with a desktop UA so responsive shells (sidebars) match a
  // real laptop browser instead of headless-Chrome defaults.
  const context = await browser.newContext({
    viewport: {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    // networkidle can hang on sites with long-poll/analytics; fall back to
    // domcontentloaded so SPAs still render, then give the app time to paint.
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    }
    // Let fonts / late layout settle, then best-effort dismiss a modal/tour.
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
    return await page.screenshot({ type: 'png', fullPage: false });
  } finally {
    await context.close();
  }
}

function readJsonBody(req: import('http').IncomingMessage): Promise<CaptureBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
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

/**
 * Vite middleware: POST /__capture_website { url, width, height }
 * → { dataUrl: "data:image/png;base64,..." }
 */
export function websiteCapturePlugin(): Plugin {
  const attach = (server: {
    middlewares: {
      use: (
        fn: (
          req: import('http').IncomingMessage,
          res: import('http').ServerResponse,
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
      try {
        const body = await readJsonBody(req);
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        const width = Number(body.width);
        const height = Number(body.height);
        if (!url || !Number.isFinite(width) || !Number.isFinite(height)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'url, width, and height required' }));
          return;
        }
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid url' }));
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'only http(s) urls allowed' }));
          return;
        }
        const png = await captureWebsite(url, width, height);
        const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ dataUrl }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'capture failed',
          }),
        );
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
