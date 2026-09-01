import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import handler from '../../api/screenshotapi';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

type FakeRes = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  chunks: Array<string | Uint8Array>;
  status: (code: number) => FakeRes;
  setHeader: (name: string, value: string) => void;
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string | Uint8Array) => void;
  end: (chunk?: string) => void;
  json: (body: unknown) => void;
};

function createRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: null,
    headers: {},
    chunks: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
    },
    write(chunk) {
      this.chunks.push(chunk);
    },
    end(chunk) {
      if (chunk != null) this.chunks.push(chunk);
    },
    json(body) {
      this.body = body;
    },
  };
  return res;
}

function makeRequest(
  url: string,
  headers: Record<string, string | string[] | undefined> = {},
) {
  return { method: 'GET', url, headers };
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function arrayBufferFromBytes(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function okUpstreamResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'image/png'], ['x-credits-remaining', '4999']]),
    arrayBuffer: async () => arrayBufferFromBytes(PNG_BYTES),
    json: async () => ({}),
  };
}

function errorUpstreamResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    headers: new Map(),
    arrayBuffer: async () => arrayBufferFromBytes(new Uint8Array(0)),
    json: async () => body,
  };
}

describe('api/screenshotapi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('SCREENSHOTAPI_KEY', '');
    (lookup as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects non-GET requests', async () => {
    const res = createRes();
    await handler({ method: 'POST', url: '/api/screenshotapi?url=x', headers: {} }, res as never);
    expect(res.statusCode).toBe(405);
    expect((res.body as { error: string }).error).toBe('Method not allowed');
  });

  it('rejects missing url', async () => {
    const res = createRes();
    await handler(makeRequest('/api/screenshotapi'), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/url/i);
  });

  it('rejects invalid / non-http(s) urls', async () => {
    const res = createRes();
    await handler(makeRequest('/api/screenshotapi?url=ftp://example.com'), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/invalid|http/i);
  });

  it('rejects blocked hosts (private IP)', async () => {
    (lookup as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: '127.0.0.1', family: 4 },
    ]);
    const res = createRes();
    await handler(makeRequest('/api/screenshotapi?url=https://internal.local/'), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('blocked host');
  });

  it('returns 400 when no API key is available', async () => {
    const res = createRes();
    await handler(
      makeRequest('/api/screenshotapi?url=https://example.com', {}),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/API key/i);
  });

  it('forwards the x-api-key header and returns PNG + credits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okUpstreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      makeRequest('/api/screenshotapi?url=https://example.com', {
        'x-api-key': 'user-key-123',
      }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Cache-Control']).toBe('public, max-age=3600');
    expect(res.headers['x-credits-remaining']).toBe('4999');
    expect(res.chunks).toHaveLength(1);

    const [callUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callUrl).toMatch(/^https:\/\/screenshotapi\.to\/api\/v1\/screenshot\?/);
    expect(init.headers).toEqual({ 'x-api-key': 'user-key-123' });
  });

  it('falls back to env var when no header is provided', async () => {
    vi.stubEnv('SCREENSHOTAPI_KEY', 'env-key-abc');
    const fetchMock = vi.fn().mockResolvedValue(okUpstreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(makeRequest('/api/screenshotapi?url=https://example.com'), res as never);

    expect(res.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'x-api-key': 'env-key-abc' });
  });

  it('passes through provider error with status', async () => {
    vi.stubEnv('SCREENSHOTAPI_KEY', 'env-key');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errorUpstreamResponse(403, { message: 'invalid key' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(makeRequest('/api/screenshotapi?url=https://example.com'), res as never);

    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toMatch(/invalid key/i);
  });

  it('validates width/height params', async () => {
    vi.stubEnv('SCREENSHOTAPI_KEY', 'env-key');
    const fetchMock = vi.fn().mockResolvedValue(okUpstreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      makeRequest('/api/screenshotapi?url=https://example.com&width=100&height=200'),
      res as never,
    );

    const [callUrl] = fetchMock.mock.calls[0] as [string];
    const url = new URL(callUrl);
    expect(url.searchParams.get('width')).toBe('100');
    expect(url.searchParams.get('height')).toBe('200');
  });
});
