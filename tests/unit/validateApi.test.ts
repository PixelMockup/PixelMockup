import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import handler from '../../api/validate';

type FakeRes = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => FakeRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

function createRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
    },
  };
  return res;
}

function makeReq(body: unknown) {
  return { method: 'POST', url: '/api/validate', headers: {}, body };
}

function httpResponse(status: number, headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}

describe('api/validate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects non-POST requests', async () => {
    const res = createRes();
    await handler({ method: 'GET', url: '/api/validate', headers: {} }, res as never);
    expect(res.statusCode).toBe(405);
  });

  it('rejects invalid provider', async () => {
    const res = createRes();
    await handler(makeReq({ provider: 'nope' }), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('Invalid provider');
  });

  it('screenshotapi: returns no_key when key is missing', async () => {
    const res = createRes();
    await handler(makeReq({ provider: 'screenshotapi' }), res as never);
    expect((res.body as { valid: boolean; reason: string }).valid).toBe(false);
    expect((res.body as { reason: string }).reason).toBe('no_key');
  });

  it('screenshotapi: returns valid with credits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(httpResponse(200, { 'x-credits-remaining': '4200' })),
    );
    const res = createRes();
    await handler(makeReq({ provider: 'screenshotapi', key: 'key-1' }), res as never);
    const body = res.body as { valid: boolean; creditsRemaining: number };
    expect(body.valid).toBe(true);
    expect(body.creditsRemaining).toBe(4200);
  });

  it('screenshotapi: maps 402 to credits_exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(402)));
    const res = createRes();
    await handler(makeReq({ provider: 'screenshotapi', key: 'key-1' }), res as never);
    expect((res.body as { reason: string }).reason).toBe('credits_exhausted');
  });

  it('screenshotapi: maps 403 to invalid_key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(403)));
    const res = createRes();
    await handler(makeReq({ provider: 'screenshotapi', key: 'bad' }), res as never);
    expect((res.body as { reason: string }).reason).toBe('invalid_key');
  });

  it('microlink: free tier valid response includes rate limit info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        httpResponse(200, {
          'x-rate-limit-remaining': '24',
          'x-rate-limit-limit': '25',
          'x-rate-limit-reset': '1700000000',
        }),
      ),
    );
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    const body = res.body as {
      valid: boolean;
      remaining: number;
      limit: number;
      resetAt: number;
      tier: string;
    };
    expect(body.valid).toBe(true);
    expect(body.remaining).toBe(24);
    expect(body.limit).toBe(25);
    expect(body.resetAt).toBe(1700000000);
    expect(body.tier).toBe('free');
  });

  it('microlink: uses pro tier when key provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(httpResponse(200, {}, {}));
    vi.stubGlobal('fetch', fetchMock);
    const res = createRes();
    await handler(makeReq({ provider: 'microlink', key: 'ml-key' }), res as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/pro\.microlink\.io\?/);
    expect(init?.headers).toEqual({ 'x-api-key': 'ml-key' });
    expect((res.body as { tier: string }).tier).toBe('paid');
  });

  it('microlink: maps 429 ERATE to quota_exhausted with resetAt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        httpResponse(
          429,
          { 'x-rate-limit-reset': '1720000000' },
          { code: 'ERATE' },
        ),
      ),
    );
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    const body = res.body as { valid: boolean; reason: string; resetAt: number };
    expect(body.valid).toBe(false);
    expect(body.reason).toBe('quota_exhausted');
    expect(body.resetAt).toBe(1720000000);
  });

  it('microlink: maps 429 non-ERATE to rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(429, {}, {})));
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    expect((res.body as { reason: string }).reason).toBe('rate_limited');
  });

  it('microlink: maps 403 to invalid_key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(httpResponse(403)));
    const res = createRes();
    await handler(makeReq({ provider: 'microlink', key: 'bad' }), res as never);
    expect((res.body as { reason: string }).reason).toBe('invalid_key');
  });

  it('microlink: falls back to shared server key when no client key provided', async () => {
    vi.stubEnv('MICROLINK_API_KEY', 'shared-key-1');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        httpResponse(200, {
          'x-rate-limit-remaining': '3',
          'x-rate-limit-limit': '25',
          'x-rate-limit-reset': '1720000000',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/pro\.microlink\.io\?/);
    expect(init?.headers).toEqual({ 'x-api-key': 'shared-key-1' });
    const body = res.body as {
      valid: boolean;
      remaining: number;
      limit: number;
      resetAt: number;
      tier: string;
      usesSharedKey: boolean;
    };
    expect(body.valid).toBe(true);
    expect(body.remaining).toBe(3);
    expect(body.limit).toBe(25);
    expect(body.resetAt).toBe(1720000000);
    expect(body.tier).toBe('shared');
    expect(body.usesSharedKey).toBe(true);
  });

  it('microlink: reports shared-key exhausted when shared key quota is used up', async () => {
    vi.stubEnv('MICROLINK_API_KEY', 'shared-key-1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        httpResponse(
          429,
          { 'x-rate-limit-reset': '1730000000' },
          { code: 'ERATE' },
        ),
      ),
    );
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    const body = res.body as {
      valid: boolean;
      reason: string;
      resetAt: number;
      tier: string;
      usesSharedKey: boolean;
    };
    expect(body.valid).toBe(false);
    expect(body.reason).toBe('quota_exhausted');
    expect(body.resetAt).toBe(1730000000);
    expect(body.tier).toBe('shared');
    expect(body.usesSharedKey).toBe(true);
  });

  it('microlink: client key takes precedence over shared server key', async () => {
    vi.stubEnv('MICROLINK_API_KEY', 'shared-key-1');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(httpResponse(200, {}, {}));
    vi.stubGlobal('fetch', fetchMock);
    const res = createRes();
    await handler(makeReq({ provider: 'microlink', key: 'own-key' }), res as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/pro\.microlink\.io\?/);
    expect(init?.headers).toEqual({ 'x-api-key': 'own-key' });
    expect((res.body as { tier: string }).tier).toBe('paid');
    expect((res.body as { usesSharedKey: boolean }).usesSharedKey).toBe(false);
  });

  it('handles network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const res = createRes();
    await handler(makeReq({ provider: 'microlink' }), res as never);
    expect(res.statusCode).toBe(500);
    expect((res.body as { reason: string }).reason).toBe('network_error');
  });
});
