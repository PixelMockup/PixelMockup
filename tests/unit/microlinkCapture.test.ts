import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import handler from '../../api/microlink-capture';

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

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]);
const CDN_URL = 'https://cdn.microlink.io/screenshots/abc.png';

function arrayBufferFromBytes(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function mlSuccessResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Map([
      ['x-rate-limit-remaining', '24'],
      ['x-rate-limit-limit', '25'],
      ['x-rate-limit-reset', '1700000000'],
    ]),
    json: async () => ({ status: 'success', data: { screenshot: { url: CDN_URL } } }),
  };
}

function mlErrorResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status === 200,
    status,
    headers: new Map(),
    json: async () => body,
  };
}

function cdnResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'image/png']]),
    arrayBuffer: async () => arrayBufferFromBytes(PNG_BYTES),
  };
}

describe('api/microlink-capture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('MICROLINK_API_KEY', '');
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
    await handler({ method: 'POST', url: '/api/microlink-capture?url=x', headers: {} }, res as never);
    expect(res.statusCode).toBe(405);
  });

  it('rejects missing url', async () => {
    const res = createRes();
    await handler(makeRequest('/api/microlink-capture'), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/url/i);
  });

  it('rejects blocked hosts', async () => {
    (lookup as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: '10.0.0.1', family: 4 },
    ]);
    const res = createRes();
    await handler(
      makeRequest('/api/microlink-capture?url=https://internal.local/'),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('blocked host');
  });

  it('does the two-step fetch and returns PNG with rate-limit headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mlSuccessResponse())
      .mockResolvedValueOnce(cdnResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      makeRequest('/api/microlink-capture?url=https://example.com'),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['x-rate-limit-remaining']).toBe('24');
    expect(res.headers['x-rate-limit-limit']).toBe('25');
    expect(res.headers['x-rate-limit-reset']).toBe('1700000000');
    expect(res.chunks).toHaveLength(1);

    // First call → microlink API (free tier), second → CDN
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toMatch(/^https:\/\/api\.microlink\.io\?/);
    expect(firstUrl).toContain('example.com');
    expect(firstInit?.headers).toEqual({});

    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toBe(CDN_URL);
  });

  it('uses pro.microlink.io and forwards x-api-key when a key is provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mlSuccessResponse())
      .mockResolvedValueOnce(cdnResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      makeRequest('/api/microlink-capture?url=https://example.com', {
        'x-api-key': 'ml-key-123',
      }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toMatch(/^https:\/\/pro\.microlink\.io\?/);
    expect(firstInit?.headers).toEqual({ 'x-api-key': 'ml-key-123' });
  });

  it('returns an error when microlink does not return a screenshot', async () => {
    vi.stubEnv('MICROLINK_API_KEY', 'env-key');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mlErrorResponse(200, { status: 'error', message: 'boom' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(makeRequest('/api/microlink-capture?url=https://example.com'), res as never);

    expect(res.statusCode).toBe(200);
    expect((res.body as { error: string }).error).toMatch(/boom/);
  });

  it('returns an error when the CDN fetch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mlSuccessResponse())
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Map() });
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(makeRequest('/api/microlink-capture?url=https://example.com'), res as never);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/CDN/i);
  });
});
