import { getCreditState, setCreditState } from './creditsStore.js';

type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

const FETCH_TIMEOUT_MS = 15_000;

function respondJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.json(body);
}

function headerStr(headers: Headers, name: string): string | undefined {
  const v = headers.get(name);
  return v != null ? v : undefined;
}

function headerValue(headers: VercelRequest['headers'], name: string): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

export async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    respondJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // Check for stored state first (auto-reset applied)
  const mlStored = getCreditState('microlink');
  const parsed = new URL(req.url ?? '/', 'http://local');
  const saKey = headerValue(req.headers, 'x-api-key') || (req.body as any)?.key || parsed.searchParams.get('key') || undefined;
  const saStored = saKey ? getCreditState('screenshotapi', saKey) : null;

  // If we have stored SA state, return it
  if (saKey && saStored) {
    respondJson(res, 200, {
      provider: 'screenshotapi',
      remaining: saStored.remaining,
      limit: saStored.limit,
      resetAt: saStored.resetAt,
    });
    return;
  }

  // For microlink: always probe server (shared key)
  const sharedKey = process.env.MICROLINK_API_KEY;
  const baseUrl = 'https://api.microlink.io';
  const headers: Record<string, string> = {};
  if (sharedKey) headers['x-api-key'] = sharedKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}?url=https://example.com&screenshot=true&meta=false`,
      { headers, signal: controller.signal },
    );
  } catch (err) {
    clearTimeout(timer);
    // If probe fails but we have stored state, return stored (with reset applied)
    if (mlStored) {
      respondJson(res, 200, {
        provider: 'microlink',
        remaining: mlStored.remaining,
        limit: mlStored.limit,
        resetAt: mlStored.resetAt,
      });
      return;
    }
    respondJson(res, 500, {
      error: 'network_error',
      message: err instanceof Error ? err.message : 'Failed to reach Microlink',
    });
    return;
  } finally {
    clearTimeout(timer);
  }

  const rateLimitRemaining = headerStr(response.headers, 'x-rate-limit-remaining');
  const rateLimitLimit = headerStr(response.headers, 'x-rate-limit-limit');
  const rateLimitReset = headerStr(response.headers, 'x-rate-limit-reset');

  const remaining = rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null;
  const limit = rateLimitLimit ? parseInt(rateLimitLimit, 10) : 25;
  const resetAt = rateLimitReset ? parseInt(rateLimitReset, 10) : null;

  // Store in server memory
  setCreditState('microlink', remaining, limit, resetAt);

  respondJson(res, 200, {
    provider: 'microlink',
    remaining: remaining ?? (mlStored ? mlStored.remaining : 25),
    limit: limit ?? (mlStored ? mlStored.limit : 25),
    resetAt: resetAt ?? (mlStored ? mlStored.resetAt : null),
  });
}

export const config = { maxDuration: 15 };
export default handler;
