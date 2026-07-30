import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  captureOne,
  captureWebsiteScreenshot,
  captureWebsiteScreenshotsCached,
  classifyCaptureError,
  classifyWebsiteInput,
  clearWebsiteCaptureCache,
  describeCaptureError,
  ensureCaptureAvailable,
  isCaptureAbortError,
  isCaptureUnavailable,
  resetCaptureAvailabilityForTests,
  CAPTURE_WEBSITE_PATH,
} from '../../src/captureWebsite';

function captureFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    (call) => call[0] === CAPTURE_WEBSITE_PATH || call[0] === '/__capture_website',
  );
}

/** Empty-body probe used by ensureCaptureAvailable — never launches Chrome. */
function isProbeCall(init?: RequestInit): boolean {
  return typeof init?.body === 'string' && init.body === '{}';
}

function realCaptureFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return captureFetchCalls(fetchMock).filter((call) => !isProbeCall(call[1]));
}

function mockCaptureAvailable(
  fetchMock: ReturnType<typeof vi.fn>,
  handler: (init?: RequestInit) => unknown,
) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url !== CAPTURE_WEBSITE_PATH && url !== '/__capture_website') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (isProbeCall(init)) {
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid or non-http(s) url' }),
      });
    }
    return Promise.resolve(handler(init));
  });
}

describe('captureWebsite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearWebsiteCaptureCache();
    resetCaptureAvailabilityForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearWebsiteCaptureCache();
    resetCaptureAvailabilityForTests();
  });

  it('posts viewport and returns dataUrl', async () => {
    const fetchMock = vi.fn();
    mockCaptureAvailable(fetchMock, () => ({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,abc' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const url = await captureWebsiteScreenshot('https://example.com/', 390, 844);
    expect(url).toBe('data:image/png;base64,abc');
    expect(realCaptureFetchCalls(fetchMock)).toHaveLength(1);
    expect(realCaptureFetchCalls(fetchMock)[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('dedupes identical viewports in one export pass', async () => {
    const fetchMock = vi.fn();
    mockCaptureAvailable(fetchMock, () => ({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,xyz' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const map = await captureWebsiteScreenshotsCached([
      { key: 'a', url: 'https://example.com/', width: 390, height: 844 },
      { key: 'b', url: 'https://example.com/', width: 390, height: 844 },
      { key: 'c', url: 'https://example.com/', width: 1440, height: 900 },
    ]);

    expect(map.get('a')).toBe('data:image/png;base64,xyz');
    expect(map.get('b')).toBe('data:image/png;base64,xyz');
    expect(realCaptureFetchCalls(fetchMock)).toHaveLength(2);
  });

  it('reuses the shared cache across preview and export (no recapture)', async () => {
    const fetchMock = vi.fn();
    mockCaptureAvailable(fetchMock, () => ({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,shared' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    // Preview captures once.
    await captureOne('https://example.com/', 390, 844);
    // Export requests the same url + viewport.
    const map = await captureWebsiteScreenshotsCached([
      { key: 'x', url: 'https://example.com/', width: 390, height: 844 },
    ]);

    expect(map.get('x')).toBe('data:image/png;base64,shared');
    expect(realCaptureFetchCalls(fetchMock)).toHaveLength(1);
  });

  it('maps a bad response to a clear error', async () => {
    const fetchMock = vi.fn();
    mockCaptureAvailable(fetchMock, () => ({
      ok: false,
      json: async () => ({ error: 'not found' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      captureWebsiteScreenshot('https://example.com/', 100, 100),
    ).rejects.toThrow(/not found/i);
  });

  it('propagates network failures for classification at the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(
      captureWebsiteScreenshot('https://example.com/', 100, 100),
    ).rejects.toThrow(/capture server unavailable|Failed to fetch/i);
  });

  it('classifyCaptureError explains Chrome launch failures', () => {
    const notice = classifyCaptureError(
      new Error('Failed to launch chromium executable'),
    );
    expect(notice.kind).toBe('chrome_missing');
    expect(notice.reason).toMatch(/browser process|Chrome/i);
    expect(notice.remediation).toMatch(/screenshot/i);
    expect(
      describeCaptureError(new Error('Failed to launch chromium executable')),
    ).toMatch(/chrome/i);
  });

  it('classifyCaptureError explains navigation timeouts', () => {
    const notice = classifyCaptureError(
      new Error('page.goto: Timeout 25000ms exceeded.'),
    );
    expect(notice.kind).toBe('timeout');
    expect(notice.reason.length).toBeGreaterThan(20);
    expect(notice.remediation).toMatch(/screenshot|captcha/i);
    expect(
      describeCaptureError(
        new Error('Site took too long to load (timeout). Try another URL.'),
      ),
    ).toMatch(/too long to load|timeout/i);
  });

  it('classifyCaptureError explains busy / too-many-captures failures', () => {
    expect(classifyCaptureError(new Error('too many captures')).kind).toBe(
      'busy',
    );
    expect(describeCaptureError(new Error('too many captures'))).toMatch(
      /busy with other devices/i,
    );
  });

  it('classifyCaptureError explains blocked host', () => {
    const notice = classifyCaptureError(new Error('blocked host'));
    expect(notice.kind).toBe('blocked_host');
    expect(notice.reason).toMatch(/private|local|metadata/i);
    expect(notice.remediation).toMatch(/screenshot/i);
  });

  it('classifyCaptureError explains unreachable capture server', () => {
    const notice = classifyCaptureError(new TypeError('Failed to fetch'));
    expect(notice.kind).toBe('unreachable_server');
    expect(notice.summary).toMatch(/npm run dev|upload a screenshot|hosted/i);
    expect(notice.reason).toMatch(/vercel|static|capture endpoint/i);
  });

  it('maps missing capture endpoint (HTML 404) to unreachable_server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    await expect(
      captureWebsiteScreenshot('https://example.com/', 100, 100),
    ).rejects.toThrow(/capture server unavailable/i);

    const notice = classifyCaptureError(
      new Error('capture server unavailable'),
    );
    expect(notice.kind).toBe('unreachable_server');
  });

  it('classifyCaptureError does not put raw "capture failed" in the body', () => {
    const notice = classifyCaptureError(new Error('capture failed'));
    expect(notice.kind).toBe('generic');
    expect(notice.body.toLowerCase()).not.toBe('capture failed');
    expect(notice.body).toMatch(/automatic screenshot|couldn’t take|couldn't take/i);
    expect(notice.reason).toMatch(/captcha|automated|login/i);
    expect(notice.remediation).toMatch(/screenshot/i);
  });

  it('classifyCaptureError maps invalid URL server codes', () => {
    expect(
      classifyCaptureError(new Error('invalid or non-http(s) url')).kind,
    ).toBe('invalid_url');
  });

  it('classifyCaptureError maps forbidden origin', () => {
    const notice = classifyCaptureError(new Error('forbidden origin'));
    expect(notice.kind).toBe('forbidden_origin');
    expect(notice.reason).toMatch(/origin/i);
  });

  it('classifyCaptureError treats AbortError as cancelled, not timeout', () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    expect(classifyCaptureError(abortErr).kind).toBe('cancelled');
    expect(classifyCaptureError(abortErr).kind).not.toBe('timeout');
    expect(isCaptureAbortError(abortErr)).toBe(true);
    expect(
      isCaptureAbortError(new Error('page.goto: Timeout 20000ms exceeded')),
    ).toBe(false);
  });

  it('clearWebsiteCaptureCache aborts in-flight fetches', async () => {
    let sawSignal = false;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url !== '/__capture_website' && url !== CAPTURE_WEBSITE_PATH) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (isProbeCall(init)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid or non-http(s) url' }),
        });
      }
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error('missing signal'));
          return;
        }
        sawSignal = true;
        signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingCapture = captureWebsiteScreenshot(
      'https://example.com/',
      390,
      844,
    );
    await vi.waitFor(() => {
      expect(sawSignal).toBe(true);
    });
    clearWebsiteCaptureCache();
    await expect(pendingCapture).rejects.toSatisfy(
      (err: unknown) => isCaptureAbortError(err),
    );
  });

  it('classifyWebsiteInput distinguishes blocked vs invalid', () => {
    expect(classifyWebsiteInput('http://127.0.0.1/').kind).toBe('blocked_host');
    expect(classifyWebsiteInput('not a url!!!').kind).toBe('invalid_url');
  });

  it('retries once on 429 too many captures then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    let realAttempt = 0;
    mockCaptureAvailable(fetchMock, () => {
      realAttempt += 1;
      if (realAttempt === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: 'too many captures' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ dataUrl: 'data:image/png;base64,ok' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingCapture = captureWebsiteScreenshot(
      'https://example.com/',
      390,
      844,
    );
    await vi.advanceTimersByTimeAsync(500);
    const url = await pendingCapture;
    expect(url).toBe('data:image/png;base64,ok');
    expect(realCaptureFetchCalls(fetchMock)).toHaveLength(2);
    vi.useRealTimers();
  });

  it('ensureCaptureAvailable treats JSON error responses as available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid or non-http(s) url' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCaptureAvailable()).resolves.toBe(true);
    await expect(ensureCaptureAvailable()).resolves.toBe(true);
    expect(captureFetchCalls(fetchMock)).toHaveLength(1);
    expect(isCaptureUnavailable()).toBe(false);
  });

  it('ensureCaptureAvailable treats HTML/static 404 as unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCaptureAvailable()).resolves.toBe(false);
    expect(isCaptureUnavailable()).toBe(true);
    await expect(captureOne('https://example.com/', 100, 100)).rejects.toThrow(
      /capture server unavailable/i,
    );
    // Probe only — no per-device POSTs after the flag is set.
    expect(captureFetchCalls(fetchMock)).toHaveLength(1);
  });

  it('short-circuits sibling captures after a missing-endpoint response', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (isProbeCall(init)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid or non-http(s) url' }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(captureOne('https://example.com/', 100, 100)).rejects.toThrow(
      /capture server unavailable/i,
    );
    await expect(captureOne('https://example.com/', 200, 200)).rejects.toThrow(
      /capture server unavailable/i,
    );
    await expect(captureOne('https://other.test/', 300, 300)).rejects.toThrow(
      /capture server unavailable/i,
    );
    // 1 probe + 1 real POST, then short-circuit.
    expect(captureFetchCalls(fetchMock)).toHaveLength(2);
    expect(isCaptureUnavailable()).toBe(true);
  });
});
