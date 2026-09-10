import { useState, useEffect, useCallback } from 'react';
import type { Provider, SaStatus } from '../types/screenshot';
import { formatResetTime, hasResetTimePassed } from '../utils/formatResetTime';
import {
  getScreenshotProvider,
  setScreenshotProvider,
  getScreenshotApiKey,
  setScreenshotApiKey,
  getMicrolinkApiKey,
  setMicrolinkApiKey,
} from '../screenshotProviders';
import { useCredits } from '../useCredits';
import type { CreditState } from '../useCredits';

interface ScreenshotSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  credits: CreditState;
  onNotify: (msg: string, tone?: 'info' | 'error') => void;
  updateScreenshotApiCredits: (remaining: number | null, limit?: number | null, resetAt?: number | null) => void;
  refreshCredits: () => Promise<void>;
  onProviderChange?: (provider: Provider) => void;
}

const SCREENSHOT_API_KEYS_URL = 'https://screenshotapi.to';
const MICROLINK_KEYS_URL = 'https://microlink.io/docs';

export default function ScreenshotSettings({
  isOpen,
  onClose,
  onNotify,
  onProviderChange,
}: ScreenshotSettingsProps) {
  // This is updated automatically by `captureWebsite.ts` after actual captures, costing ZERO extra API calls.
  const { credits, updateScreenshotApiCredits, refreshCredits } = useCredits();
  const [view, setView] = useState<Provider>(() =>
    getScreenshotProvider() === 'screenshotapi' ? 'screenshotapi' : 'microlink',
  );
  const [saKey, setSaKeyState] = useState(getScreenshotApiKey);
  const [mlKey, setMlKeyState] = useState(getMicrolinkApiKey);
  const [saStatus, setSaStatus] = useState<SaStatus>({ valid: null });
  const [_resetTick, setResetTick] = useState(0);

  // Derive Microlink status directly from the live credits state
  const ml = credits.microlink;
  const mlExhausted = ml.remaining != null && ml.remaining <= 0;
  const usingPersonalMlKey = ml.tier === 'paid' || ml.tier === 'pro' || ml.tier === 'enterprise';

  useEffect(() => {
    if (!isOpen) return;
    const stored = getScreenshotProvider();
    setView(stored === 'screenshotapi' ? 'screenshotapi' : 'microlink');
    setSaKeyState(getScreenshotApiKey());
    setMlKeyState(getMicrolinkApiKey());
    setSaStatus({ valid: null });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (ml.resetAt && hasResetTimePassed(ml.resetAt)) {
      const refreshTimer = window.setTimeout(() => {
        refreshCredits();
      }, 5_000); // Wait 5 seconds after reset, then refresh

      return () => window.clearTimeout(refreshTimer);
    }
  }, [isOpen, ml.resetAt, ml.remaining, refreshCredits]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => {
      setResetTick((t) => t + 1);
      // Check if we should auto-refresh credits
      if (ml.resetAt && hasResetTimePassed(ml.resetAt) && ml.remaining === 0) {
        refreshCredits();
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isOpen, ml.resetAt, ml.remaining, refreshCredits, setResetTick]);

  const handleSaKeyChange = useCallback((key: string) => {
    setSaKeyState(key);
    setScreenshotApiKey(key);
  }, []);

  const handleMlKeyChange = useCallback((key: string) => {
    setMlKeyState(key);
    setMicrolinkApiKey(key);
  }, []);

  const validateSa = useCallback(async () => {
    if (!saKey) return;

    setSaStatus((s) => ({ ...s, valid: null, loading: true }));

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'screenshotapi', key: saKey }),
      });

      if (!res.ok) {
        setSaStatus({ valid: false, reason: 'error', loading: false });
        return;
      }

      const data = await res.json();
      const creditsRemaining = data.creditsRemaining ?? null;
      const resetAt = data.resetAt ?? null;
      const limit = data.limit ?? null; // Default to 200 if not provided

      setSaStatus({
        valid: data.valid ?? false,
        creditsRemaining,
        reason: data.reason ?? data.message ?? undefined,
        loading: false,
      });

      if (data.valid) {
        try {
          updateScreenshotApiCredits(creditsRemaining, limit, resetAt);
        } catch (err) {
          console.log('Failed to update ScreenshotAPI credits state: ', err);
        }
      }
    } catch {
      setSaStatus({ valid: false, reason: 'network_error', loading: false });
    }
  }, [saKey, updateScreenshotApiCredits]);

  const handleViewScreenshotApi = useCallback(() => {
    setView('screenshotapi');
  }, []);

  const handleViewMicrolink = useCallback(() => {
    setView('microlink');
  }, []);

  const handleUseScreenshotApi = useCallback(() => {
    if (saStatus.valid !== true) {
      onNotify('Enter and validate a ScreenshotAPI key to use it', 'error');
      return;
    }
    setScreenshotProvider('screenshotapi');
    onProviderChange?.('screenshotapi');
    onNotify('Using ScreenshotAPI');
    onClose();
  }, [saStatus.valid, onNotify, onProviderChange, onClose]);

  const handleUseMicrolink = useCallback(() => {
    setScreenshotProvider('microlink');
    onNotify('Using Microlink');
    onClose();
    onProviderChange?.('microlink');
  }, [onNotify, onClose, onProviderChange]);

  if (!isOpen) return null;

  return (
    <dialog
      className="ms-modal-backdrop"
      open
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ms-modal ms-ss-modal">
        <div className="ms-modal-header">
          <div>
            <h2>API &amp; keys</h2>
            <p className="ms-modal-sub">
              Configure cloud screenshot providers. Microlink uses a shared key by default (optionally yours). ScreenshotAPI needs your own key.
            </p>
          </div>
          <button
            type="button"
            className="ms-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="ms-modal-body">
          <div className="ms-ss-provider-toggle" role="tablist" aria-label="Screenshot provider">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'screenshotapi'}
              className={`ms-ss-toggle-btn${view === 'screenshotapi' ? ' active' : ''}`}
              onClick={handleViewScreenshotApi}
            >
              ScreenshotAPI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'microlink'}
              className={`ms-ss-toggle-btn${view === 'microlink' ? ' active' : ''}`}
              onClick={handleViewMicrolink}
            >
              Microlink
            </button>
          </div>

          {view === 'screenshotapi' ? (
            <div className="ms-ss-key-card">
              <div className="ms-ss-key-group">
                <div className="ms-ss-key-header">
                  <span className="ms-ss-key-name">ScreenshotAPI</span>
                  <span className="ms-ss-badge ms-ss-badge--required">Key required</span>
                </div>
                <p className="ms-ss-desc">
                  ~200 requests per month on the free plan. Paste your key to enable this provider.
                </p>
                <div className="ms-ss-key-row">
                  <input
                    type="password"
                    className="ms-ss-key-input"
                    placeholder="screenshotapi.to key"
                    value={saKey}
                    onChange={(e) => handleSaKeyChange(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ms-ss-validate-btn"
                    disabled={!saKey || saStatus.loading}
                    onClick={() => void validateSa()}
                  >
                    {saStatus.loading ? 'Checking...' : 'Validate'}
                  </button>
                </div>
                <div className={`ms-ss-status${saStatus.valid === true ? ' ok' : ''}${saStatus.valid === false ? ' error' : ''}`}>
                  {saStatus.valid === true && (
                    <>Valid{saStatus.creditsRemaining != null ? ` — ${saStatus.creditsRemaining} credits remaining` : ''}</>
                  )}
                  {saStatus.valid === false && saStatus.reason === 'credits_exhausted' && 'No credits remaining'}
                  {saStatus.valid === false && saStatus.reason === 'invalid_key' && 'Invalid API key'}
                  {saStatus.valid === false && saStatus.reason === 'no_key' && 'Enter an API key'}
                  {saStatus.valid === false && saStatus.reason === 'network_error' && 'Network error — could not reach the validation server'}
                  {saStatus.valid === false && saStatus.reason === 'error' && 'Validation failed'}
                  {saStatus.valid == null && !saStatus.loading && (
                    <span className="ms-ss-status-hint">Validate your key to switch to ScreenshotAPI.</span>
                  )}
                </div>
                <div className="ms-ss-actions">
                  <a
                    className="ms-ss-link"
                    href={SCREENSHOT_API_KEYS_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Get a ScreenshotAPI key →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="ms-ss-key-card">
              <div className="ms-ss-key-group">
                <div className="ms-ss-key-header">
                  <span className="ms-ss-key-name">Microlink</span>
                  <span className="ms-ss-badge ms-ss-badge--optional">
                    {usingPersonalMlKey ? 'Your key' : 'Shared key'}
                  </span>
                </div>
                <p className="ms-ss-desc">
                  Microlink works out of the box with a shared server key. Paste your own key if you bought one.
                </p>
                <div className="ms-ss-key-row">
                  <input
                    type="password"
                    className="ms-ss-key-input"
                    placeholder="Microlink API key (optional)"
                    value={mlKey}
                    onChange={(e) => handleMlKeyChange(e.target.value)}
                  />
                </div>

                {ml.remaining != null ? (
                  hasResetTimePassed(ml.resetAt || 0) && ml.remaining <= 0 ? (
                    <div className="ms-ss-usage ms-ss-status-warn" style={{ marginBottom: '1rem' }}>
                      Reset window reached. Refreshing credits...
                    </div>
                  ) : (
                    <div className={`ms-ss-usage${mlExhausted ? ' ms-ss-usage--exhausted' : ''}`}>
                      <span className="ms-ss-usage__value">
                        {ml.limit != null
                          ? `${ml.remaining}/${ml.limit}`
                          : `${ml.remaining}`}
                      </span>
                      <span className="ms-ss-usage__label">
                        {usingPersonalMlKey ? 'available on your key' : 'available on shared key'}
                      </span>
                      {ml.resetAt != null && (
                        <span className="ms-ss-usage__reset">{formatResetTime(ml.resetAt)}</span>
                      )}
                    </div>
                  )
                ) : (
                  <div className="ms-ss-status">
                    <span className="ms-ss-status-hint">
                      Usage will appear here after your first screenshot capture.
                    </span>
                  </div>
                )}
                {mlExhausted && !hasResetTimePassed(ml.resetAt || 0) && (
                  <div className="ms-ss-status ms-ss-status-warn">
                    The shared Microlink key is used up for today. Get your own key via the link below to keep capturing.
                  </div>
                )}
                <div className="ms-ss-actions">
                  <a
                    className="ms-ss-link"
                    href={MICROLINK_KEYS_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    About Microlink / get your own key →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ms-modal-actions">
          <button
            type="button"
            className="ms-btn ms-btn--primary"
            disabled={view === 'screenshotapi' && saStatus.valid !== true}
            onClick={view === 'screenshotapi' ? handleUseScreenshotApi : handleUseMicrolink}
          >
            {view === 'screenshotapi' ? 'Use ScreenshotAPI' : 'Use Microlink'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
