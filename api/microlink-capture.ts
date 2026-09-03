import { lookup } from 'node:dns/promises';
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

function headerStr(headers: Headers, name: string): string | undefined {
  const v = headers.get(name);
  return v != null ? v : undefined;
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

  const userApiKey = headerValue(req.headers, 'x-api-key') || process.env.MICROLINK_API_KEY || '';

  const params = new URLSearchParams({
    url: normalised,
    screenshot: 'true',
    meta: 'false',
    'viewport.width': String(Math.min(1920, Math.max(1, Math.round(Number(width))))),
    'viewport.height': String(Math.min(1080, Math.max(1, Math.round(Number(height))))),
  });

  const baseUrl = userApiKey ? 'https://pro.microlink.io' : 'https://api.microlink.io';
  const requestHeaders: Record<string, string> = {};
  if (userApiKey) requestHeaders['x-api-key'] = userApiKey;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let apiResponse: Response;
    try {
      apiResponse = await fetch(`${baseUrl}?${params}`, {
        headers: requestHeaders,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const rateLimitRemaining = headerStr(apiResponse.headers, 'x-rate-limit-remaining');
    const rateLimitLimit = headerStr(apiResponse.headers, 'x-rate-limit-limit');
    const rateLimitReset = headerStr(apiResponse.headers, 'x-rate-limit-reset');

    const json = await apiResponse.json() as {
      status?: string;
      message?: string;
      data?: { screenshot?: { url?: string } };
    };

    if (json.status !== 'success' || !json.data?.screenshot?.url) {
      respondJson(res, apiResponse.status || 502, {
        error: json.message || 'Microlink did not return a screenshot',
      });
      return;
    }

    const imageController = new AbortController();
    const imageTimer = setTimeout(() => imageController.abort(), FETCH_TIMEOUT_MS);

    let imageResponse: Response;
    try {
      imageResponse = await fetch(json.data.screenshot.url, { signal: imageController.signal });
    } finally {
      clearTimeout(imageTimer);
    }

    if (!imageResponse.ok) {
      respondJson(res, 502, {
        error: `Failed to fetch screenshot from Microlink CDN: ${imageResponse.status}`,
      });
      return;
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    const respHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };
    if (rateLimitRemaining) respHeaders['x-rate-limit-remaining'] = rateLimitRemaining;
    if (rateLimitLimit) respHeaders['x-rate-limit-limit'] = rateLimitLimit;
    if (rateLimitReset) respHeaders['x-rate-limit-reset'] = rateLimitReset;

    res.writeHead(200, respHeaders);
    res.write(buffer);
    res.end();
  } catch (err) {
    console.error('[microlink-capture]', err);
    respondJson(res, 500, {
      error: err instanceof Error ? err.message : 'Screenshot capture failed',
    });
  }
}

export const config = { maxDuration: 30 };
export default handler;
