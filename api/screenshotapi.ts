import { lookup } from 'node:dns/promises';
import { setCreditState } from './creditsStore.js';
import { isBlockedAddress, normalizeWebsiteUrl } from '../src/websiteUrl.js';

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
const SCREENSHOTAPI_ENDPOINT = 'https://screenshotapi.to/api/v1/screenshot';

function headerValue(headers: VercelRequest['headers'], name: string): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

function respondJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.json(body);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function assertPublicHost(url: string): Promise<void> {
  const { hostname } = new URL(url);
  if (isBlockedAddress(hostname)) throw new Error('blocked host');
  try {
    const addrs = await withTimeout(
      lookup(hostname, { all: true }),
      DNS_TIMEOUT_MS,
      'DNS lookup timed out',
    );
    if (addrs.length === 0 || addrs.some((a: { address: string }) => isBlockedAddress(a.address))) {
      throw new Error('blocked host');
    }
  } catch {
    throw new Error('blocked host');
  }
}

function headerNum(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    respondJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const parsed = new URL(req.url ?? '/', 'http://local');
  const targetUrl = parsed.searchParams.get('url');
  const width = parsed.searchParams.get('width') ?? '1440';
  const height = parsed.searchParams.get('height') ?? '900';
  const type = parsed.searchParams.get('type') ?? 'png';

  if (!targetUrl) {
    respondJson(res, 400, { error: 'Missing ?url= parameter' });
    return;
  }

  const normalised = normalizeWebsiteUrl(targetUrl);
  if (!normalised) {
    respondJson(res, 400, { error: 'invalid or non-http(s) url' });
    return;
  }

  try {
    await assertPublicHost(normalised);
  } catch {
    respondJson(res, 400, { error: 'blocked host' });
    return;
  }

  const apiKey = headerValue(req.headers, 'x-api-key') || process.env.SCREENSHOTAPI_KEY || '';
  if (!apiKey) {
    respondJson(res, 400, {
      error: 'ScreenshotAPI requires an API key. Enter one in the API Keys section.',
    });
    return;
  }

  const params = new URLSearchParams({
    url: normalised,
    type,
    width: String(Math.min(1920, Math.max(1, Math.round(Number(width))))),
    height: String(Math.min(10000, Math.max(1, Math.round(Number(height))))),
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(`${SCREENSHOTAPI_ENDPOINT}?${params}`, {
        headers: { 'x-api-key': apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
      respondJson(res, upstream.status, {
        error: (body?.message ?? body?.error ?? `ScreenshotAPI error ${upstream.status}`) as string,
      });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'image/png';
    const creditsRemaining = headerNum(upstream.headers, 'x-credits-remaining');
    // Update server-side credit storage with real-time header value
    if (creditsRemaining != null) {
      setCreditState('screenshotapi', creditsRemaining, 200, null, apiKey);
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      ...(creditsRemaining != null ? { 'x-credits-remaining': String(creditsRemaining) } : {}),
    });
    res.write(buffer);
    res.end();
  } catch (err) {
    console.error('[screenshotapi]', err);
    respondJson(res, 500, {
      error: err instanceof Error ? err.message : 'Screenshot capture failed',
    });
  }
}

export const config = { maxDuration: 30 };
export default handler;
