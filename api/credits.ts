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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
  // POST initiates counter once from live API headers; GET returns current state; decrement happens in middleware on 200
  if (req.method === 'POST') {
    try {
      const parsed = new URL(req.url ?? '/', 'http://local');
      const provider = (parsed.searchParams.get('provider') || 'microlink') as string;
      // Initialize middleware counter from external endpoint (one-time)
      const { initCounter } = await import('../src/middleware.js');
      // Probe public endpoint for screenshotapi no-key, or key endpoint if key present
      const key = headerValue(req.headers, 'x-api-key') || (req.body as any)?.key || process.env.SCREENSHOTAPI_KEY;
      const isSA = provider === 'screenshotapi';
      const endpoint = (isSA && key) ? 'https://screenshotapi.to/api/v1/screenshot?url=https://example.com&type=png' : (isSA ? 'https://screenshotapi.to/api/v1/public/screenshot?url=https://example.com' : 'https://api.microlink.io?url=https://example.com&screenshot=true&meta=false');
      const headers: Record<string,string> = {};
      if (key && isSA) headers['x-api-key'] = key;
      const probe = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
      const rem = probe.headers.get('x-ratelimit-remaining') || probe.headers.get('x-rate-limit-remaining');
      const lim = probe.headers.get('x-ratelimit-limit') || probe.headers.get('x-rate-limit-limit');
      const reset = probe.headers.get('x-ratelimit-reset') || probe.headers.get('x-rate-limit-reset');
      initCounter({ limit: lim ? parseInt(lim,10) : (isSA ? 8 : 25), remaining: rem ? parseInt(rem,10) : (isSA ? 8 : 25), resetAt: reset ? parseInt(reset,10) : null });
      respondJson(res, 200, { initialized: true, provider, remaining: rem ? parseInt(rem,10) : null, limit: lim ? parseInt(lim,10) : null });
    } catch (e) {
      respondJson(res, 500, { error: String(e) });
    }
    return;
  }
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

  // OPTIMIZATION: If the store already auto-reset and is at full capacity, 
  // return it immediately and skip the unnecessary API probe!
  if (mlStored && mlStored.resetAt === null && mlStored.remaining === mlStored.limit) {
    respondJson(res, 200, {
      provider: 'microlink',
      remaining: mlStored.remaining,
      limit: mlStored.limit,
      resetAt: null,
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

  // 4. SMART MERGE: If the live probe says we are exhausted, but the reset time 
  // has already passed, trust the auto-reset logic instead of the stale probe.
  const nowSec = Math.floor(Date.now() / 1000);
  const isProbeExhausted = remaining !== null && remaining <= 0;
  const isResetPast = resetAt !== null && nowSec >= resetAt;

  let finalRemaining = remaining;
  let finalLimit = limit;
  let finalResetAt = resetAt;

  if ((isProbeExhausted && isResetPast) || (mlStored && mlStored.resetAt === null && mlStored.remaining === mlStored.limit)) {
    finalRemaining = mlStored ? mlStored.limit : (limit ?? 25);
    finalLimit = mlStored ? mlStored.limit : (limit ?? 25);
    finalResetAt = null; // Will be updated on next successful fresh probe
  }

  // 5. Update store only with the corrected, smart values
  if (finalRemaining !== null || finalLimit !== null || finalResetAt !== null) {
    setCreditState('microlink', finalRemaining, finalLimit, finalResetAt);
  }

  // 6. Probe ScreenshotAPI public endpoint (no key) for rate-limit headers
  let saPublicRemaining = null;
  let saPublicLimit = null;
  try {
    const saCtrl = new AbortController();
    const saTimer = setTimeout(() => saCtrl.abort(), 5000);
    const saPublicRes = await fetch('https://screenshotapi.to/api/v1/public/screenshot?url=https://example.com', { method: 'HEAD', signal: saCtrl.signal });
    clearTimeout(saTimer);
    const rem = saPublicRes.headers.get('x-ratelimit-remaining');
    const lim = saPublicRes.headers.get('x-ratelimit-limit');
    if (rem != null) saPublicRemaining = parseInt(rem, 10);
    if (lim != null) saPublicLimit = parseInt(lim, 10);
  } catch {
    // ignore
  }

  respondJson(res, 200, {
    provider: 'microlink',
    remaining: remaining ?? (mlStored ? mlStored.remaining : 25),
    limit: limit ?? (mlStored ? mlStored.limit : 25),
    resetAt: resetAt ?? (mlStored ? mlStored.resetAt : null),
    remainingwithoutapi: saPublicRemaining,
    limitwithoutapi: saPublicLimit,
    refreshSeconds: (await import('../src/middleware.js')).getRefreshSeconds ? (await import('../src/middleware.js')).getRefreshSeconds() : Math.max(0, 60 - (Math.floor(Date.now()/1000) % 60)),
  });
}

export const config = { maxDuration: 15 };
export default handler;
