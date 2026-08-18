import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildProxyUrl,
  probeProxyAvailable,
  resetProxyAvailabilityForTests,
  warmProxy,
} from '../../src/websiteProxy';

describe('websiteProxy', () => {
  beforeEach(() => {
    resetProxyAvailabilityForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetProxyAvailabilityForTests();
  });

  it('builds an encoded proxy url', () => {
    expect(buildProxyUrl('https://example.com/a b/')).toBe(
      '/api/proxy?url=https%3A%2F%2Fexample.com%2Fa%20b%2F',
    );
  });

  it('probes once and caches availability', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProxyAvailable()).resolves.toBe(true);
    await expect(probeProxyAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/proxy?probe=1');
  });

  it('returns false when the response is not JSON (local/static host)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    await expect(probeProxyAvailable()).resolves.toBe(false);
  });

  it('returns false on network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(probeProxyAvailable()).resolves.toBe(false);
  });

  it('caches a negative result too', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProxyAvailable()).resolves.toBe(false);
    await expect(probeProxyAvailable()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('warms a normalized url once per session', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    warmProxy('https://example.com/');
    warmProxy('https://example.com/');
    warmProxy('example.com/');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy?url=https%3A%2F%2Fexample.com%2F',
    );
  });

  it('ignores invalid urls when warming', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    warmProxy('not a url');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a failed warm request on the next call', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    warmProxy('https://retry.example/');
    await Promise.resolve();
    await Promise.resolve();
    warmProxy('https://retry.example/');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
