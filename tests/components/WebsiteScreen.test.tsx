import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('shows a friendly error when capture fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    render(
      <WebsiteScreen url="https://example.com/" viewport={VIEWPORT} title="Site" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/capture server|npm run dev/i),
      ).toBeInTheDocument();
    });
  });
});
