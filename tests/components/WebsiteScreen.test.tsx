import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import WebsiteScreen from '../../src/WebsiteScreen';
import {
  clearWebsiteCaptureCache,
  resetCaptureAvailabilityForTests,
} from '../../src/captureWebsite';
import { setScreenshotProvider } from '../../src/screenshotProviders';
import {
  resetProxyAvailabilityForTests,
  setProxyAvailableForTests,
} from '../../src/websiteProxy';

const VIEWPORT = { width: 390, height: 844 };

/** Dispatch a postMessage-style event from the device frame (or elsewhere). */
function sendSiteProgress(
  frame: HTMLIFrameElement,
  pct: number,
  source?: Window | null,
) {
  fireEvent(
    window,
    new MessageEvent('message', {
      data: { marker: '__msSiteProgress', phase: 'parsing', pct },
      source: source === undefined ? frame.contentWindow : source,
    }),
  );
}

describe('WebsiteScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearWebsiteCaptureCache();
    resetCaptureAvailabilityForTests();
    setScreenshotProvider('playwright');
    resetProxyAvailabilityForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearWebsiteCaptureCache();
    resetCaptureAvailabilityForTests();
    resetProxyAvailabilityForTests();
  });

  it('shows loading, then the captured screenshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (typeof init?.body === 'string' && init.body === '{}') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ error: 'invalid or non-http(s) url' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ dataUrl: 'data:image/png;base64,shot' }),
        });
      }),
    );

    render(
      <WebsiteScreen url="https://example.com/" viewport={VIEWPORT} title="Site" />,
    );

    expect(screen.getByText('Loading site…')).toBeInTheDocument();

    await waitFor(() => {
      const img = screen.getByAltText('Site') as HTMLImageElement;
      expect(img.src).toBe('data:image/png;base64,shot');
    });
  });

  it('shows a short inline error when capture fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const onCaptureFailed = vi.fn();
    const onRequestDetails = vi.fn();
    const onSwitchToIframe = vi.fn();

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        onCaptureFailed={onCaptureFailed}
        onRequestDetails={onRequestDetails}
        onSwitchToIframe={onSwitchToIframe}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/capture unavailable — upload a screenshot/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use live iframe' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(onCaptureFailed).toHaveBeenCalled();
    });
    expect(onCaptureFailed.mock.calls[0][0].kind).toBe('unreachable_server');

    fireEvent.click(screen.getByRole('button', { name: 'Use live iframe' }));
    expect(onSwitchToIframe).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(onRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'unreachable_server' }),
    );
  });

  it('starts the proxied load optimistically before the probe resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    );

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    const frame = await screen.findByTitle('Site') as HTMLIFrameElement;
    expect(frame.tagName).toMatch('IFRAME');
    expect(frame.getAttribute('src')).toMatch(/\/api\/proxy\?url=https%3A%2F%2Fexample\.com%2F?/);
    expect(
      screen.getByText(/live preview — some sites still break/i),
    ).toBeInTheDocument();
    // Proxied content is same-origin with the app — keep it isolated.
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('shows a per-device loading bar until the iframe loads', async () => {
    setProxyAvailableForTests(true);

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    const frame = await screen.findByTitle('Site') as HTMLIFrameElement;
    await waitFor(() => {
      expect(frame.getAttribute('src')).toMatch(/\/api\/proxy\?url=https%3A%2F%2Fexample\.com%2F?/);
    });
    await act(async () => { });
    expect(screen.getByText(/Loading site…/i)).toBeInTheDocument();

    fireEvent.load(frame);
    await waitFor(() => {
      expect(screen.queryByText(/Loading site…/i)).not.toBeInTheDocument();
    });
  });

  it('shows determinate progress reported by the proxied page', async () => {
    setProxyAvailableForTests(true);

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    const frame = screen.getByTitle('Site') as HTMLIFrameElement;
    await act(async () => { });

    sendSiteProgress(frame, 40);
    expect(screen.getByText(/Loading site… 40%/i)).toBeInTheDocument();
    const bar = document.querySelector(
      '.ms-canvas-item__website-loading-bar--determinate',
    ) as HTMLElement | null;
    expect(bar?.style.width).toBe('40%');

    sendSiteProgress(frame, 100);
    await waitFor(() => {
      expect(screen.queryByText(/Loading site…/i)).not.toBeInTheDocument();
    });
  });

  it('ignores progress messages from other sources', () => {
    setProxyAvailableForTests(true);

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    const frame = screen.getByTitle('Site') as HTMLIFrameElement;
    sendSiteProgress(frame, 40, window);
    expect(screen.getByText(/Loading site…/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading site… 40%/i)).not.toBeInTheDocument();
  });

  it('auto-hides the loading bar after the slow-load timeout', async () => {
    vi.useFakeTimers();
    setProxyAvailableForTests(true);

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    await act(async () => { });
    expect(screen.getByText(/Loading site…/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(screen.queryByText(/Loading site…/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/live preview — some sites still break/i),
    ).toBeInTheDocument();
  });

  it('falls back to the raw url when the proxy is unavailable', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Proxy Unavailable'));

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        previewMode="iframe"
      />,
    );

    const frame = screen.getByTitle('Site') as HTMLIFrameElement;
    await waitFor(() => {
      expect(frame.getAttribute('src')).toMatch(/https:\/\/example\.com\/?/);
    });
  });

  it('stays loading on AbortError (no timeout/error UI)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (typeof init?.body === 'string' && init.body === '{}') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ error: 'invalid or non-http(s) url' }),
          });
        }
        return Promise.reject(
          new DOMException('The operation was aborted.', 'AbortError'),
        );
      }),
    );

    const onCaptureFailed = vi.fn();

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        onCaptureFailed={onCaptureFailed}
      />,
    );

    expect(screen.getByText('Loading site…')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(
          (c) =>
            typeof c[0] === 'string' &&
            c[0].includes('/__capture_website') &&
            typeof c[1]?.body === 'string' &&
            c[1].body !== '{}',
        ),
      ).toBe(true);
    });
    // Still loading — abort must not flip to error/timeout UI.
    expect(screen.getByText('Loading site…')).toBeInTheDocument();
    expect(
      screen.queryByText(
        /couldn't load this site|couldn't load this site|capture unavailable/i,
      ),
    ).toBeNull();
    expect(onCaptureFailed).not.toHaveBeenCalled();
  });
});
