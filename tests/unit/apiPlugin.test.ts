import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiPlugin } from '../../scripts/apiPlugin.js';

type Middleware = (req: unknown, res: unknown, next: () => void) => void | Promise<void>;

function captureMiddleware(): Middleware {
  let captured: Middleware | undefined;
  const plugin = apiPlugin() as unknown as {
    configureServer: (s: { middlewares: { use: (fn: Middleware) => void } }) => void;
  };
  plugin.configureServer({ middlewares: { use: (fn) => { captured = fn; } } });
  if (!captured) throw new Error('middleware not registered');
  return captured;
}

function makeReq(method: string, url: string, body?: string) {
  return {
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

function makeRes() {
  type Out = { headers: Record<string, string>; chunks: Buffer[] };
  const out: Out = { headers: {}, chunks: [] };
  const result = {
    statusCode: 200,
    writableEnded: false,
    setHeader(n: string, v: string) { out.headers[n] = v; },
    writeHead(code: number, headers?: Record<string, string>) {
      result.statusCode = code;
      if (headers) Object.assign(out.headers, headers);
    },
    write(c: Buffer) { out.chunks.push(Buffer.from(c)); },
    end(c?: Buffer | string) {
      if (c != null) {
        out.chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      }
      result.writableEnded = true;
    },
  };
  return { result, out };
}

function jsonUpstream(data: unknown, status = 200, headers: Record<string, string> = {}) {
  const h = new Map<string, string>(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new Uint8Array(0)),
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null },
  };
}

describe('apiPlugin (Vercel serverless adapter for Vite dev)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards /api/validate POST and writes a JSON response via the adapter', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonUpstream({ valid: true }, 200, {
        'x-rate-limit-remaining': '16',
        'x-rate-limit-limit': '25',
      }),
    ) as never;

    const middleware = captureMiddleware();
    const req = makeReq('POST', '/api/validate', JSON.stringify({ provider: 'microlink' }));
    const { result, out } = makeRes();
    const next = vi.fn();

    await middleware(req, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(out.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(Buffer.concat(out.chunks).toString('utf8'));
    expect(body.valid).toBe(true);
    expect(body.remaining).toBe(16);
    expect(body.limit).toBe(25);
  });

  it('serves /api/screenshotapi GET with binary PNG output and forwarded rate-limit headers', async () => {
    vi.stubEnv('SCREENSHOTAPI_KEY', 'test-shared-key');
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const headers = new Map<string, string>([['content-type', 'image/png'], ['x-credits-remaining', '5']]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
      arrayBuffer: () => Promise.resolve(png),
      headers: { get: (n: string) => headers.get(n) ?? null },
    }) as never;

    const middleware = captureMiddleware();
    const req = makeReq('GET', '/api/screenshotapi?url=https%3A%2F%2Fexample.com&width=100&height=100');
    const { result, out } = makeRes();
    const next = vi.fn();

    await middleware(req, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
    expect(out.headers['Content-Type']).toBe('image/png');
    expect(out.headers['x-credits-remaining']).toBe('5');
    expect(Buffer.concat(out.chunks)).toEqual(Buffer.from(png));
  });

  it('returns 405 for a known route with the wrong method', async () => {
    const middleware = captureMiddleware();
    const req = makeReq('POST', '/api/screenshotapi');
    const { result, out } = makeRes();
    const next = vi.fn();

    await middleware(req, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(405);
    const body = JSON.parse(Buffer.concat(out.chunks).toString('utf8'));
    expect(body.error).toBe('Method not allowed');
  });

  it('calls next() for unknown routes so the SPA still serves', async () => {
    const middleware = captureMiddleware();
    const req = makeReq('GET', '/some-spa-route');
    const { result, out } = makeRes();
    const next = vi.fn();

    await middleware(req, result, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(result.writableEnded).toBe(false);
    expect(out.chunks).toHaveLength(0);
  });
});
