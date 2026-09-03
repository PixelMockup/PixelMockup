import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import handler, { config, _resetProxyForTesting } from '../../api/proxy';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    // CJS interop: some import paths resolve through `default`.
    default: { lookup },
  };
});

const ALLOWED_HEADERS = {
  referer: 'https://pixelmockup.vercel.app/',
  host: 'pixelmockup.vercel.app',
};

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
      releaseLock: () => { },
    }),
  };
}

function byteBody(bytes: Uint8Array) {
  let offset = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (offset >= bytes.length) return { done: true } as const;
        const value = bytes.slice(offset, Math.min(offset + 32, bytes.length));
        offset += value.length;
        return { done: false as const, value };
      },
      releaseLock: () => { },
    }),
  };
}

function bytesOf(res: FakeRes): Buffer {
  return Buffer.concat(
    res.chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : Buffer.from(c))),
  );
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
  return res.chunks
    .map((c) => (typeof c === 'string' ? c : new TextDecoder('utf-8').decode(c)))
    .join('');
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
    _resetProxyForTesting();
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
    await handler({ method: 'GET', url: PROXY_URL, headers: ALLOWED_HEADERS }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe(
      'public, max-age=30, s-maxage=60',
    );
    expect(htmlOf(res)).toContain(
      '<base href="https://example.com/">',
    );
    expect(htmlOf(res)).toContain('__msSiteProgress');
    // No redirect happened — the final URL must not be re-validated.
    expect(vi.mocked(lookup)).toHaveBeenCalledTimes(1);
  });

  it('injects the storage sandbox shim before site scripts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(
          '<html><head><script src="/app.js"></script></head></html>',
        ),
      ),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('shim.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(200);
    const out = htmlOf(res);
    const shimAt = out.indexOf('memoryStore');
    expect(shimAt).toBeGreaterThan(-1);
    // The shim must run before any site head script executes.
    expect(out.indexOf('<script src="//')).toBeGreaterThan(shimAt);
    expect(out).toContain("shim('localStorage')");
    expect(out).toContain("shim('sessionStorage')");
  });

  it('sends browser-like headers on the upstream fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('headers.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(200);
    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers['User-Agent']).toContain('Chrome/');
    expect(init.headers['Accept']).toContain('text/html');
    expect(init.headers['Accept-Language']).toContain('en-US');
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
        headers: ALLOWED_HEADERS,
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(htmlOf(res)).toContain(
      '<base href="https://example.com/docs/">',
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
      { method: 'GET', url: proxyUrlFor('unicode.example'), headers: ALLOWED_HEADERS },
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
    await handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res1);
    const res2 = createRes();
    await handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(htmlOf(res1)).toBe(htmlOf(res2));
    // Cache hits must skip the DNS validation entirely.
    expect(vi.mocked(lookup)).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries per app origin (aliases embed their own host)', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      htmlResponse('<html><head><script src="/app.js"></script></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = proxyUrlFor('origin.example');

    const res1 = createRes();
    await handler(
      { method: 'GET', url, headers: { ...ALLOWED_HEADERS, host: 'one.vercel.app' } },
      res1,
    );
    const res2 = createRes();
    await handler(
      { method: 'GET', url, headers: { ...ALLOWED_HEADERS, host: 'two.vercel.app' } },
      res2,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(htmlOf(res1)).toContain('//one.vercel.app/api/proxy?url=');
    expect(htmlOf(res2)).toContain('//two.vercel.app/api/proxy?url=');
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
    await handler({ method: 'GET', url: url1, headers: ALLOWED_HEADERS }, res1);
    const res2 = createRes();
    await handler({ method: 'GET', url: url2, headers: ALLOWED_HEADERS }, res2);

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
      handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res1),
      handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res2),
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
    await handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res1);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    const res2 = createRes();
    await handler({ method: 'GET', url, headers: ALLOWED_HEADERS }, res2);

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
        headers: ALLOWED_HEADERS,
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
        headers: ALLOWED_HEADERS,
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
        headers: ALLOWED_HEADERS,
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
      { method: 'GET', url: proxyUrlFor('redirect.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'blocked host' });
  });

  it('passes binary subresources through with long CDN caching', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://assets.example/logo.png',
        body: byteBody(png),
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? 'image/png'
              : name.toLowerCase() === 'content-length'
                ? null
                : null,
        },
        text: async () => '',
      }),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: `/api/proxy?url=${encodeURIComponent(
          'https://assets.example/logo.png',
        )}`,
        headers: ALLOWED_HEADERS,
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Cache-Control']).toBe(
      'public, max-age=3600, s-maxage=86400',
    );
    expect(bytesOf(res).equals(Buffer.from(png))).toBe(true);
  });

  it('rewrites same-host subresources through the proxy and leaves third-party hosts alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(
          '<html><head>' +
          '<link rel="stylesheet" href="/css/all.css">' +
          '<script src="/vendor/x.js"></script>' +
          '<script src="https://cdn.jsdelivr.net/other.js"></script>' +
          '<script src="https://rewrite.example/vendor/y.js"></script>' +
          '</head><body>' +
          '<img src="img/a.png" srcset="img/a.png 1x, img/b.png 2x">' +
          '<img src="data:image/svg+xml;base64,AAAA">' +
          '<a href="/about">About</a>' +
          '<a href="#section">Jump</a>' +
          '<a href="mailto:x@y.z">Mail</a>' +
          '</body></html>',
        ),
      ),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: proxyUrlFor('rewrite.example'),
        headers: { ...ALLOWED_HEADERS, host: 'app.local' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    const out = htmlOf(res);
    const pfx = (path: string) =>
      `//app.local/api/proxy?url=${encodeURIComponent(
        `https://rewrite.example${path}`,
      )}`;
    expect(out).toContain(`href="${pfx('/css/all.css')}"`);
    expect(out).toContain(`src="${pfx('/vendor/x.js')}"`);
    expect(out).toContain(`src="${pfx('/vendor/y.js')}"`);
    // Third-party host stays untouched.
    expect(out).toContain('src="https://cdn.jsdelivr.net/other.js"');
    // srcset candidates are rewritten individually.
    expect(out).toContain(`srcset="${pfx('/img/a.png')} 1x, ${pfx('/img/b.png')} 2x"`);
    // data:/fragment/mailto are never proxied.
    expect(out).toContain('src="data:image/svg+xml;base64,AAAA"');
    expect(out).toContain('href="#section"');
    expect(out).toContain('href="mailto:x@y.z"');
    // Same-host anchors are proxied so in-site navigation stays consistent.
    expect(out).toContain(`href="${pfx('/about')}"`);
  });

  it('rewritten urls stay on the app host despite the injected target base tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(
          '<html><head><script src="/vendor/app.js"></script></head></html>',
        ),
      ),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: proxyUrlFor('base.example'),
        headers: { ...ALLOWED_HEADERS, host: 'app.local' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    const out = htmlOf(res);
    // The injected <base> points at the target — but rewritten URLs resolve
    // onto the app origin when the browser applies that base.
    const src = /src="(.*?app\.local.*?)"/.exec(out);
    expect(src).not.toBeNull();
    expect(new URL(src![1], 'https://base.example/').hostname).toBe('app.local');
    expect(src![1]).toContain('/api/proxy?url=');
  });

  it('never double-proxies an already rewritten url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(
          '<html><head></head><body><img src="/api/proxy?url=https%3A%2F%2Fonce.example%2Fimg.png"></body></html>',
        ),
      ),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('once.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(200);
    const out = htmlOf(res);
    expect(out.split('src="/api/proxy?url=https%3A%2F%2Fonce.example%2Fimg.png"').length - 1).toBe(1);
  });

  it('strips the target CSP meta tag so the injected scripts can run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(
          '<html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head></html>',
        ),
      ),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('csp.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(htmlOf(res)).not.toContain('Content-Security-Policy');
    expect(htmlOf(res)).toContain('ms-site-progress');
  });

  it('rewrites url() references in proxied same-host stylesheets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://css.example/vendor/fa/css/all.min.css',
        body: streamedBody(
          "@font-face{src:url('../webfonts/fa-solid-900.woff2')}\n" +
          ".icon{background:url('/img/sprite.png')}\n" +
          "@import 'https://css.example/other.css';",
        ),
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? 'text/css; charset=utf-8'
              : name.toLowerCase() === 'content-length'
                ? null
                : null,
        },
        text: async () => '',
      }),
    );

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: `/api/proxy?url=${encodeURIComponent(
          'https://css.example/vendor/fa/css/all.min.css',
        )}`,
        headers: { ...ALLOWED_HEADERS, host: 'app.local' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/css; charset=utf-8');
    const out = htmlOf(res);
    const pfx = (path: string) =>
      `//app.local/api/proxy?url=${encodeURIComponent(`https://css.example${path}`)}`;
    expect(out).toContain(`url('${pfx('/vendor/fa/webfonts/fa-solid-900.woff2')}')`);
    expect(out).toContain(`url('${pfx('/img/sprite.png')}')`);
    expect(out).toContain(`@import "${pfx('/other.css')}"`);
  });

  it('allows referers that differ only by port', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<html><head></head></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await handler(
      {
        method: 'GET',
        url: proxyUrlFor('port.example'),
        headers: {
          referer: 'https://pixelmockup.vercel.app:8443/preview',
          host: 'pixelmockup.vercel.app',
        },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
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
      { method: 'GET', url: proxyUrlFor('big.example'), headers: ALLOWED_HEADERS },
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
    expect(res.body).toEqual({ error: 'Forbidden: Proxy is restricted to PixelMockup domains only.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the target fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const res = createRes();
    await handler(
      { method: 'GET', url: proxyUrlFor('fail.example'), headers: ALLOWED_HEADERS },
      res,
    );
    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toBe('Failed to fetch website');
  });
});
