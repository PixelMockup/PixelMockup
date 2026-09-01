import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScreenshotSettings from '../../src/components/ScreenshotSettings';

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
      onClose={opts.onClose ?? (() => {})}
      onNotify={opts.onNotify ?? vi.fn()}
    />,
  );
}

function mlValidateResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      valid: true,
      remaining: 24,
      limit: 25,
      resetAt: Math.floor(Date.now() / 1000) + 60 * 60,
      tier: 'shared',
      usesSharedKey: true,
      ...overrides,
    }),
  };
}

function saValidateResponse(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    creditsRemaining: 4200,
    ...overrides,
  };
}

/** Mock /api/validate that routes by provider in the POST body. */
function stubValidate(handlers: Record<string, () => Record<string, unknown>>) {
  const fetchMock = vi.fn().mockImplementation((url: unknown, init?: RequestInit) => {
    if (String(url) === '/api/validate' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const handler = handlers[body.provider];
      if (handler) {
        return Promise.resolve({ ok: true, status: 200, json: async () => handler() });
      }
    }
    return Promise.resolve(mlValidateResponse());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ScreenshotSettings', () => {
  beforeEach(() => {
    setUpDialog();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mlValidateResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ScreenshotSettings isOpen={false} onClose={() => {}} onNotify={vi.fn()} />,
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
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('shows shared-key daily usage with reset countdown', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/24\/25/)).toBeInTheDocument();
    });
  });

  it('labels shared key as connected and usage as shared', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Shared key connected')).toBeInTheDocument();
      expect(screen.getByText(/available on shared key/i)).toBeInTheDocument();
    });
  });

  it('shows a warning when the shared key is exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mlValidateResponse({
          valid: false,
          remaining: 0,
          limit: 25,
          resetAt: Math.floor(Date.now() / 1000) + 5 * 3600,
          reason: 'quota_exhausted',
          usesSharedKey: true,
        }),
      ),
    );
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/shared microlink key is used up for today/i)).toBeInTheDocument();
    });
  });

  it('validates a personal microlink key and marks it as connected', async () => {
    stubValidate({
      microlink: () => ({
        valid: true,
        remaining: 100,
        limit: 1000,
        resetAt: Math.floor(Date.now() / 1000) + 3600,
        tier: 'paid',
        usesSharedKey: false,
      }),
    });
    renderDialog();
    const input = screen.getByPlaceholderText(/microlink api key/i);
    fireEvent.change(input, { target: { value: 'own-ml-key' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => {
      expect(screen.getByText(/your key connected/i)).toBeInTheDocument();
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
    stubValidate({ screenshotapi: () => saValidateResponse() });

    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'ScreenshotAPI' }));
    fireEvent.change(screen.getByPlaceholderText(/screenshotapi.to key/i), {
      target: { value: 'test-key-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await waitFor(() => {
      expect(screen.getByText(/4200 credits remaining/i)).toBeInTheDocument();
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof stubValidate>;
    const validateCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/validate' &&
        init?.method === 'POST' &&
        JSON.parse(String(init.body)).provider === 'screenshotapi',
    ) as [string, RequestInit];
    expect(JSON.parse(String(validateCall[1].body))).toEqual({
      provider: 'screenshotapi',
      key: 'test-key-123',
    });
  });

  it('uses ScreenshotAPI after validation: notifies and closes', async () => {
    stubValidate({ screenshotapi: () => saValidateResponse() });
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

  it('persists a validated personal microlink key for use by captures', async () => {
    stubValidate({
      microlink: () => ({
        valid: true,
        remaining: 100,
        limit: 1000,
        resetAt: Math.floor(Date.now() / 1000) + 3600,
        tier: 'paid',
        usesSharedKey: false,
      }),
    });
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText(/microlink api key/i), {
      target: { value: 'my-bought-key' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => {
      expect(localStorage.getItem('pixelMockup.microlinkApiKey')).toBe('my-bought-key');
    });
  });
});
