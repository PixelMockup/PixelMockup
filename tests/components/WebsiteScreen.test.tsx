import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WebsiteScreen from '../../src/WebsiteScreen';
import { clearWebsiteCaptureCache } from '../../src/captureWebsite';

const VIEWPORT = { width: 390, height: 844 };

describe('WebsiteScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearWebsiteCaptureCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearWebsiteCaptureCache();
  });

  it('shows loading, then the captured screenshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ dataUrl: 'data:image/png;base64,shot' }),
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

    render(
      <WebsiteScreen
        url="https://example.com/"
        viewport={VIEWPORT}
        title="Site"
        onCaptureFailed={onCaptureFailed}
        onRequestDetails={onRequestDetails}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/couldn’t load this site|couldn't load this site/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    await waitFor(() => {
      expect(onCaptureFailed).toHaveBeenCalled();
    });
    expect(onCaptureFailed.mock.calls[0][0].kind).toBe('unreachable_server');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(onRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'unreachable_server' }),
    );
  });

  it('stays loading on AbortError (no timeout/error UI)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
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
            c[0].includes('/__capture_website'),
        ),
      ).toBe(true);
    });
    // Still loading — abort must not flip to error/timeout UI.
    expect(screen.getByText('Loading site…')).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn’t load this site|couldn't load this site/i),
    ).toBeNull();
    expect(onCaptureFailed).not.toHaveBeenCalled();
  });
});