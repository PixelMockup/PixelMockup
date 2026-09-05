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

type Provider = 'screenshotapi' | 'microlink';

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

async function validateScreenshotapi(apiKey: string, res: VercelResponse): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      'https://screenshotapi.to/api/v1/screenshot?url=https://example.com&type=png&width=100&height=100',
      { headers: { 'x-api-key': apiKey }, signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    const creditsRemaining = headerStr(response.headers, 'x-credits-remaining');
    respondJson(res, 200, {
      valid: true,
      creditsRemaining: creditsRemaining ? parseInt(creditsRemaining, 10) : null,
    });
    return;
  }

  if (response.status === 402) {
    respondJson(res, 200, { valid: false, reason: 'credits_exhausted' });
    return;
  }

  if (response.status === 403) {
    respondJson(res, 200, { valid: false, reason: 'invalid_key' });
    return;
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  respondJson(res, 200, {
    valid: false,
    reason: 'error',
    message: (body?.message ?? body?.error ?? `Unexpected status ${response.status}`) as string,
  });
}

async function validateMicrolink(apiKey: string | undefined, res: VercelResponse): Promise<void> {
  const sharedKey = process.env.MICROLINK_API_KEY;
  const effectiveKey = apiKey || sharedKey || undefined;
  const usesSharedKey = !apiKey && !!sharedKey;
  const baseUrl = effectiveKey ? 'https://pro.microlink.io' : 'https://api.microlink.io';
  const headers: Record<string, string> = {};
  if (effectiveKey) headers['x-api-key'] = effectiveKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}?url=https://example.com&screenshot=true&meta=false`,
      { headers, signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }

  const rateLimitRemaining = headerStr(response.headers, 'x-rate-limit-remaining');
  const rateLimitLimit = headerStr(response.headers, 'x-rate-limit-limit');
  const rateLimitReset = headerStr(response.headers, 'x-rate-limit-reset');

  if (response.ok) {
    respondJson(res, 200, {
      valid: true,
      remaining: rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null,
      limit: rateLimitLimit ? parseInt(rateLimitLimit, 10) : null,
      resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : null,
      tier: effectiveKey ? (usesSharedKey ? 'shared' : 'paid') : 'free',
      usesSharedKey,
    });
    return;
  }

  if (response.status === 429) {
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (body?.code === 'ERATE') {
      respondJson(res, 200, {
        valid: false,
        reason: 'quota_exhausted',
        resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : null,
        tier: effectiveKey ? (usesSharedKey ? 'shared' : 'paid') : 'free',
        usesSharedKey,
      });
      return;
    }
    respondJson(res, 200, {
      valid: false,
      reason: 'rate_limited',
      resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : null,
      usesSharedKey,
    });
    return;
  }

  if (response.status === 403) {
    respondJson(res, 200, { valid: false, reason: 'invalid_key' });
    return;
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  respondJson(res, 200, {
    valid: false,
    reason: 'error',
    message: (body?.message ?? `Unexpected status ${response.status}`) as string,
  });
}

export async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    respondJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body: { provider?: Provider; key?: string };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    respondJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const { provider, key } = body;

  if (!provider || !['screenshotapi', 'microlink'].includes(provider)) {
    respondJson(res, 400, { error: 'Invalid provider' });
    return;
  }

  try {
    if (provider === 'screenshotapi') {
      if (!key) {
        respondJson(res, 200, {
          valid: false,
          reason: 'no_key',
          message: 'ScreenshotAPI requires an API key',
        });
        return;
      }
      await validateScreenshotapi(key, res);
    } else {
      await validateMicrolink(key || undefined, res);
    }
  } catch (err) {
    respondJson(res, 500, {
      valid: false,
      reason: 'network_error',
      message: err instanceof Error ? err.message : 'Validation failed',
    });
  }
}

export const config = { maxDuration: 15 };
export default handler;
