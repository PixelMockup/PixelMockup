import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScreenshotSettings from '../../src/components/ScreenshotSettings';
import { useCredits } from '../../src/useCredits';

// Mock useCredits to control the state without making network requests
vi.mock('../../src/useCredits', () => ({
  useCredits: vi.fn(),
}));

function setUpDialog() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
}

function renderDialog(opts: { onNotify?: ReturnType<typeof vi.fn>; onClose?: ReturnType<typeof vi.fn> } = {}) {
  return render(
    <ScreenshotSettings
      isOpen
      onClose={opts.onClose ?? (() => { })}
      onNotify={opts.onNotify ?? vi.fn()}
    />,
  );
}

function saValidateResponse(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    creditsRemaining: 4200,
    ...overrides,
  };
}

/** Mock /api/validate that routes by provider in the POST body (ScreenshotAPI) */
function stubValidate() {
  const fetchMock = vi.fn().mockImplementation((url: unknown, init?: RequestInit) => {
    if (String(url) === '/api/validate' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (body.provider === 'screenshotapi') {
        return Promise.resolve({ ok: true, status: 200, json: async () => saValidateResponse() });
      }
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ScreenshotSettings', () => {
  beforeEach(() => {
    setUpDialog();
    localStorage.clear();
    vi.restoreAllMocks();

    // Simulates refresh
    (useCredits as any).mockReturnValue({
      credits: {
        screenshotapi: null,
        microlink: { remaining: null, limit: null, resetAt: null, tier: 'shared' },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ScreenshotSettings isOpen={false} onClose={() => { }} onNotify={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and provider segments when open', () => {
    renderDialog();
    expect(screen.getByText('API & keys')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ScreenshotAPI' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Microlink' })).toBeInTheDocument();
  });

  it('defaults to the Microlink panel with an optional key input and a footer Use Microlink button', () => {
    renderDialog();
    expect(screen.getByRole('tab', { name: 'Microlink' })).toHaveClass('active');
    expect(screen.getByPlaceholderText(/microlink api key/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Microlink' })).toBeInTheDocument();
  });

  it('shows hint when no usage is available yet', async () => {
    renderDialog();
    expect(screen.getByText(/usage will appear here after your first screenshot capture/i)).toBeInTheDocument();
  });

  it('shows shared-key daily usage with reset countdown when data is available', async () => {
    const futureReset = Math.floor(Date.now() / 1000) + 3600;
    (useCredits as any).mockReturnValue({
      credits: {
        screenshotapi: null,
        microlink: { remaining: 24, limit: 25, resetAt: futureReset, tier: 'shared' },
      },
    });
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/24\/25/)).toBeInTheDocument();
      expect(screen.getByText(/available on shared key/i)).toBeInTheDocument();
    });
  });

  it('shows a warning when the shared key is exhausted', async () => {
    const futureReset = Math.floor(Date.now() / 1000) + 5 * 3600;
    (useCredits as any).mockReturnValue({
      credits: {
        screenshotapi: null,
        microlink: { remaining: 0, limit: 25, resetAt: futureReset, tier: 'shared' },
      },
    });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/shared microlink key is used up for today/i)).toBeInTheDocument();
    });
  });

  it('displays personal key badge and usage when tier is paid', async () => {
    const futureReset = Math.floor(Date.now() / 1000) + 3600;
    (useCredits as any).mockReturnValue({
      credits: {
        screenshotapi: null,
        microlink: { remaining: 100, limit: 1000, resetAt: futureReset, tier: 'paid' },
      },
    });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Your key')).toBeInTheDocument();
      expect(screen.getByText(/available on your key/i)).toBeInTheDocument();
    });
  });

  it('highlight follows the viewed tab: ScreenshotAPI tab shows active color on click', () => {
    renderDialog();
    const saTab = screen.getByRole('tab', { name: 'ScreenshotAPI' });
    fireEvent.click(saTab);
    expect(saTab).toHaveClass('active');
    expect(screen.getByRole('tab', { name: 'Microlink' })).not.toHaveClass('active');
  });

  it('shows screenshotapi panel with key input and a disabled Use ScreenshotAPI footer until validated', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'ScreenshotAPI' }));
    expect(screen.getByPlaceholderText(/screenshotapi.to key/i)).toBeInTheDocument();
    const useBtn = screen.getByRole('button', { name: 'Use ScreenshotAPI' });
    expect(useBtn).toBeDisabled();
  });

  it('validates screenshotapi key via /api/validate', async () => {
    stubValidate();

    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'ScreenshotAPI' }));
    fireEvent.change(screen.getByPlaceholderText(/screenshotapi.to key/i), {
      target: { value: 'test-key-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await waitFor(() => {
      expect(screen.getByText(/4200 credits remaining/i)).toBeInTheDocument();
    });
  });

  it('uses ScreenshotAPI after validation: notifies and closes', async () => {
    stubValidate();
    const onNotify = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onNotify, onClose });

    fireEvent.click(screen.getByRole('tab', { name: 'ScreenshotAPI' }));
    fireEvent.change(screen.getByPlaceholderText(/screenshotapi.to key/i), {
      target: { value: 'key-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => {
      expect(screen.getByText(/4200 credits remaining/i)).toBeInTheDocument();
    });

    const useBtn = screen.getByRole('button', { name: 'Use ScreenshotAPI' });
    expect(useBtn).not.toBeDisabled();
    fireEvent.click(useBtn);
    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith('Using ScreenshotAPI');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('Use Microlink activates the shared key, notifies, and closes', async () => {
    const onNotify = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onNotify, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Use Microlink' }));
    expect(onNotify).toHaveBeenCalledWith('Using Microlink');
    expect(onClose).toHaveBeenCalled();
  });

  it('updates microlink api key state on change', async () => {
    renderDialog();
    const input = screen.getByPlaceholderText(/microlink api key/i);
    fireEvent.change(input, { target: { value: 'my-bought-key' } });
    expect(input).toHaveValue('my-bought-key');
  });
});
