import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import handler, { config } from '../../api/proxy';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    // CJS interop: some import paths resolve through `default`.
    default: { lookup },
  };
});

type FakeRes = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  chunks: string[];
  status: (code: number) => FakeRes;
  setHeader: (name: string, value: string) => void;
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string) => void;
  end: (chunk?: string) => void;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
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
    send(body) {
      this.body = body;
    },
  };
  return res;
}

function streamedBody(html: string, chunkSize = 24) {
  const bytes = new TextEncoder().encode(html);
  let offset = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (offset >= bytes.length) return { done: true } as const;
        const end = Math.min(offset + chunkSize, bytes.length);
        const value = bytes.slice(offset, end);
        offset = end;
        return { done: false as const, value };
      },
      releaseLock: () => {},
    }),
  };
}

function htmlResponse(
  html: string,
  init: {
    url?: string;
    contentType?: string;
    contentLength?: string;
    chunkSize?: number;
  } = {},
) {
  return {
    ok: true,
    url: init.url ?? 'https://example.com/',
    body: streamedBody(html, init.chunkSize),
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') {
          return init.contentType ?? 'text/html; charset=utf-8';
        }
        if (name.toLowerCase() === 'content-length') {
          return init.contentLength ?? null;
        }
        return null;
      },
    },
    text: async () => html,
  };
}

function htmlOf(res: FakeRes): string {
  return res.chunks.join('');
}

const PROXY_URL = '/api/proxy?url=https%3A%2F%2Fexample.com%2F';

/** Unique target per test — the module-level cache persists across cases. */
function proxyUrlFor(host: string): string {
  return `/api/proxy?url=${encodeURIComponent(`https://${host}/`)}`;
}

describe('api/proxy handler', () => {
  beforeEach(() => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('exports Hobby-compatible maxDuration', () => {
    expect(config.maxDuration).toBe(60);
  });

  it('answers the availability probe without fetching the target', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      { method: 'GET', url: '/api/proxy?probe=1', headers: {} },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams the target HTML with an injected base tag and CDN cache headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse('<html><head><title>t</title></head><body></body></html>'),
      ),
    );

    const res = createRes();
    await handler({ method: 'GET', url: PROXY_URL, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe(
      'public, max-age=60, s-maxage=300',
    );
    expect(htmlOf(res)).toContain(
      '<html><head><base href="https://example.com/">',
    );
    expect(htmlOf(res)).toContain('__msSiteProgress');
    // No redirect happened — the final URL must not be re-validated.
    expect(vi.mocked(lookup)).toHaveBeenCalledTimes(1);
  });

  it('bases relative links on the page directory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(htmlResponse('<html><head></head></html>')),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: '/api/proxy?url=https%3A%2F%2Fexample.com%2Fdocs%2Fguide',
        headers: {},
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(htmlOf(res)).toContain(
      '<html><head><base href="https://example.com/docs/">',
    );
  });

  it('keeps multi-byte characters intact across chunk boundaries', async () => {
    const page = '<html><head><title>hi</title></head><body>a😀b</body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(htmlResponse(page, { chunkSize: 7 })),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('unicode.example'), headers: {} },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(htmlOf(res)).toContain('a😀b');
  });

  it('serves a second request from the in-memory cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head><title>t</title></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = proxyUrlFor('cache.example');

    const res1 = createRes();
    await handler({ method: 'GET', url, headers: {} }, res1);
    const res2 = createRes();
    await handler({ method: 'GET', url, headers: {} }, res2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(htmlOf(res1)).toBe(htmlOf(res2));
    // Cache hits must skip the DNS validation entirely.
    expect(vi.mocked(lookup)).toHaveBeenCalledTimes(1);
  });

  it('reuses the DNS validation for later requests to the same host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head><title>t</title></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const url1 = `/api/proxy?url=${encodeURIComponent(
      'https://memo.example/docs/',
    )}`;
    const url2 = `/api/proxy?url=${encodeURIComponent(
      'https://memo.example/about/',
    )}`;
    const res1 = createRes();
    await handler({ method: 'GET', url: url1, headers: {} }, res1);
    const res2 = createRes();
    await handler({ method: 'GET', url: url2, headers: {} }, res2);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(lookup)).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head><title>t</title></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = proxyUrlFor('dedupe.example');

    const res1 = createRes();
    const res2 = createRes();
    await Promise.all([
      handler({ method: 'GET', url, headers: {} }, res1),
      handler({ method: 'GET', url, headers: {} }, res2),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(htmlOf(res1)).toContain('<base href="https://dedupe.example/">');
    expect(htmlOf(res2)).toContain('<base href="https://dedupe.example/">');
  });

  it('refetches after the cache TTL expires', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head><title>t</title></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = proxyUrlFor('ttl.example');

    const res1 = createRes();
    await handler({ method: 'GET', url, headers: {} }, res1);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    const res2 = createRes();
    await handler({ method: 'GET', url, headers: {} }, res2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
  });

  it('rejects invalid urls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: '/api/proxy?url=not%20a%20url',
        headers: {},
      },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid or non-http(s) url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects literal private hosts without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: '/api/proxy?url=http%3A%2F%2F127.0.0.1%2F',
        headers: {},
      },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'blocked host' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks hosts whose DNS resolves to a private address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: '/api/proxy?url=https%3A%2F%2Frebind.example%2F',
        headers: {},
      },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'blocked host' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks redirects that land on a private host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse('<html></html>', { url: 'http://192.168.1.9/' }),
      ),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('redirect.example'), headers: {} },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'blocked host' });
  });

  it('rejects non-HTML responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse('not html', { contentType: 'image/png' }),
      ),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: '/api/proxy?url=https%3A%2F%2Fexample.com%2Flogo.png',
        headers: {},
      },
      res,
    );
    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported content type' });
  });

  it('rejects pages that exceed the body size limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse('<html></html>', {
          contentLength: String(5 * 1024 * 1024),
        }),
      ),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('big.example'), headers: {} },
      res,
    );
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: 'page too large' });
  });

  it('rejects requests from a different origin (via referer)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: proxyUrlFor('referer.example'),
        headers: {
          referer: 'https://evil.example/',
          host: 'pixelmockup.vercel.app',
        },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden origin' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the target fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('fail.example'), headers: {} },
      res,
    );
    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toBe('Failed to fetch website');
  });
});
