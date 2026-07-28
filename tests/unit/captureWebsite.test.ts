import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  captureOne,
  captureWebsiteScreenshot,
  captureWebsiteScreenshotsCached,
  clearWebsiteCaptureCache,
  describeCaptureError,
} from '../../src/captureWebsite';

describe('captureWebsite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearWebsiteCaptureCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearWebsiteCaptureCache();
  });

  it('posts viewport and returns dataUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await captureWebsiteScreenshot('https://example.com/', 390, 844);
    expect(url).toBe('data:image/png;base64,abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/__capture_website',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('dedupes identical viewports in one export pass', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,xyz' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const map = await captureWebsiteScreenshotsCached([
      { key: 'a', url: 'https://example.com/', width: 390, height: 844 },
      { key: 'b', url: 'https://example.com/', width: 390, height: 844 },
      { key: 'c', url: 'https://example.com/', width: 1440, height: 900 },
    ]);

    expect(map.get('a')).toBe('data:image/png;base64,xyz');
    expect(map.get('b')).toBe('data:image/png;base64,xyz');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the shared cache across preview and export (no recapture)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dataUrl: 'data:image/png;base64,shared' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Preview captures once.
    await captureOne('https://example.com/', 390, 844);
    // Export requests the same url + viewport.
    const map = await captureWebsiteScreenshotsCached([
      { key: 'x', url: 'https://example.com/', width: 390, height: 844 },
    ]);

    expect(map.get('x')).toBe('data:image/png;base64,shared');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a bad response to a clear error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'not found' }),
      }),
    );
    await expect(
      captureWebsiteScreenshot('https://example.com/', 100, 100),
    ).rejects.toThrow(/not found/i);
  });

  it('maps a network failure to a friendly capture-server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(
      captureWebsiteScreenshot('https://example.com/', 100, 100),
    ).rejects.toThrow(/capture server|npm run dev/i);
  });

  it('describeCaptureError explains Chrome launch failures', () => {
    expect(
      describeCaptureError(new Error('Failed to launch chromium executable')),
    ).toMatch(/chrome/i);
  });

  it('describeCaptureError explains navigation timeouts', () => {
    expect(
      describeCaptureError(
        new Error('page.goto: Timeout 25000ms exceeded.'),
      ),
    ).toMatch(/too long to load|timeout/i);
    expect(
      describeCaptureError(
        new Error('Site took too long to load (timeout). Try another URL.'),
      ),
    ).toMatch(/too long to load/i);
  });

  it('describeCaptureError explains busy / too-many-captures failures', () => {
    expect(
      describeCaptureError(new Error('too many captures')),
    ).toMatch(/busy with other devices/i);
  });

  it('retries once on 429 too many captures then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'too many captures' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ dataUrl: 'data:image/png;base64,ok' }),
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
