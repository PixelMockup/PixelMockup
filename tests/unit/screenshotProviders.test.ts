import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getScreenshotProvider,
  setScreenshotProvider,
  getScreenshotApiKey,
  setScreenshotApiKey,
  getMicrolinkApiKey,
  setMicrolinkApiKey,
  captureWithProvider,
} from '../../src/screenshotProviders';

describe('screenshotProviders storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults provider to microlink', () => {
    expect(getScreenshotProvider()).toBe('microlink');
  });

  it('persists and reads provider', () => {
    setScreenshotProvider('screenshotapi');
    expect(getScreenshotProvider()).toBe('screenshotapi');
    setScreenshotProvider('microlink');
    expect(getScreenshotProvider()).toBe('microlink');
  });

  it('returns empty API keys by default', () => {
    expect(getScreenshotApiKey()).toBe('');
    expect(getMicrolinkApiKey()).toBe('');
  });

  it('persists and reads API keys', () => {
    setScreenshotApiKey('sa-key');
    setMicrolinkApiKey('ml-key');
    expect(getScreenshotApiKey()).toBe('sa-key');
    expect(getMicrolinkApiKey()).toBe('ml-key');
  });
});

describe('captureWithProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures via screenshotapi and returns credits from header', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png'], ['x-credits-remaining', '4200']]),
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await captureWithProvider('https://example.com', 1440, 900, 'screenshotapi', 'key-1');

    expect(result.provider).toBe('screenshotapi');
    expect(result.creditsRemaining).toBe(4200);
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const [callsUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callsUrl).toMatch(/^\/api\/screenshotapi\?/);
    expect(init?.headers).toEqual({ 'x-api-key': 'key-1' });
  });

  it('captures via microlink and returns credits from rate-limit header', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png'], ['x-rate-limit-remaining', '23']]),
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await captureWithProvider('https://example.com', 1440, 900, 'microlink', 'ml-key');

    expect(result.provider).toBe('microlink');
    expect(result.creditsRemaining).toBe(23);

    const [callsUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callsUrl).toMatch(/^\/api\/microlink-capture\?/);
    expect(init?.headers).toEqual({ 'x-api-key': 'ml-key' });
  });

  it('throws for the playwright provider (use captureOne instead)', async () => {
    await expect(
      captureWithProvider('https://example.com', 100, 100, 'playwright'),
    ).rejects.toThrow(/captureOne/);
  });

  it('surfaces API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Map(),
      json: async () => ({ message: 'invalid key' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      captureWithProvider('https://example.com', 100, 100, 'screenshotapi', 'bad'),
    ).rejects.toThrow(/invalid key/i);
  });
});
