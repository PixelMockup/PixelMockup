import { useState, useEffect, useCallback } from 'react';
import type { Provider, SaStatus, MlStatus } from '../types/screenshot';
import { formatResetTime } from '../utils/formatResetTime';
import {
  getScreenshotProvider,
  setScreenshotProvider,
  getScreenshotApiKey,
  setScreenshotApiKey,
  getMicrolinkApiKey,
  setMicrolinkApiKey,
} from '../screenshotProviders';

interface ScreenshotSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string, tone?: 'info' | 'error') => void;
}

const SCREENSHOT_API_KEYS_URL = 'https://screenshotapi.to';
const MICROLINK_KEYS_URL = 'https://microlink.io/docs';

export default function ScreenshotSettings({ isOpen, onClose, onNotify }: ScreenshotSettingsProps) {
  const [view, setView] = useState<Provider>(() =>
    getScreenshotProvider() === 'screenshotapi' ? 'screenshotapi' : 'microlink',
  );
  const [saKey, setSaKeyState] = useState(getScreenshotApiKey);
  const [mlKey, setMlKeyState] = useState(getMicrolinkApiKey);
  const [saStatus, setSaStatus] = useState<SaStatus>({ valid: null });
  const [mlStatus, setMlStatus] = useState<MlStatus>({ valid: null });
  const [resetTick, setResetTick] = useState(0);

  const validateMicrolink = useCallback(async (personalKey?: string) => {
    setMlStatus((s) => ({ ...s, valid: null, loading: true }));
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'microlink', key: personalKey || undefined }),
      });
      if (!res.ok) {
        setMlStatus({ valid: false, reason: 'error', loading: false });
        return;
      }
      const data = await res.json();
      setMlStatus({
        valid: data.valid ?? false,
        remaining: data.remaining ?? undefined,
        limit: data.limit ?? undefined,
        resetAt: data.resetAt ?? undefined,
        reason: data.reason ?? undefined,
        tier: data.tier ?? undefined,
        usesSharedKey: data.usesSharedKey ?? false,
        loading: false,
      });
    } catch {
      setMlStatus({ valid: false, reason: 'network_error', loading: false });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const stored = getScreenshotProvider();
    setView(stored === 'screenshotapi' ? 'screenshotapi' : 'microlink');
    setSaKeyState(getScreenshotApiKey());
    setMlKeyState(getMicrolinkApiKey());
    setSaStatus({ valid: null });
    setMlStatus({ valid: null });
    void validateMicrolink(undefined);
  }, [isOpen, validateMicrolink]);

  useEffect(() => {
    if (!isOpen) return;
    if (mlStatus.resetAt == null) return;
    const id = window.setInterval(() => setResetTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [isOpen, mlStatus.resetAt, resetTick]);

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
      setSaStatus({
        valid: data.valid ?? false,
        creditsRemaining: data.creditsRemaining ?? undefined,
        reason: data.reason ?? data.message ?? undefined,
        loading: false,
      });
    } catch {
      setSaStatus({ valid: false, reason: 'network_error', loading: false });
    }
  }, [saKey]);

  const handleMlKeyValidate = useCallback(async () => {
    setMlStatus((s) => ({ ...s, valid: null, loading: true }));
    const key = mlKey || undefined;
    if (!key) {
      void validateMicrolink(undefined);
      return;
    }
    void validateMicrolink(key);
  }, [mlKey, validateMicrolink]);

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
    onNotify('Using ScreenshotAPI');
    onClose();
  }, [saStatus.valid, onNotify, onClose]);

  const handleUseMicrolink = useCallback(() => {
    setScreenshotProvider('microlink');
    onNotify('Using Microlink');
    onClose();
  }, [onNotify, onClose]);

  if (!isOpen) return null;

  const usingPersonalMlKey = mlStatus.valid === true && mlStatus.usesSharedKey === false;
  const mlExhausted = mlStatus.valid === false &&
    (mlStatus.reason === 'quota_exhausted' || (mlStatus.remaining != null && mlStatus.remaining <= 0));

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
                  <button
                    type="button"
                    className="ms-ss-validate-btn"
                    disabled={mlStatus.loading}
                    onClick={() => void handleMlKeyValidate()}
                  >
                    {mlStatus.loading ? 'Checking...' : 'Validate'}
                  </button>
                </div>
                <div className={`ms-ss-status${mlStatus.valid === true ? ' ok' : ''}${mlStatus.valid === false ? ' error' : ''}`}>
                  {mlStatus.valid === true && !usingPersonalMlKey && 'Shared key connected'}
                  {mlStatus.valid === true && usingPersonalMlKey && `Your key connected${mlStatus.tier ? ` — ${mlStatus.tier} tier` : ''}`}
                  {mlStatus.valid === false && mlStatus.reason === 'invalid_key' && 'Invalid API key'}
                  {mlStatus.valid === false && mlStatus.reason === 'network_error' && 'Network error'}
                  {mlStatus.valid === false && mlStatus.reason === 'error' && 'Validation failed'}
                  {mlStatus.valid == null && !mlStatus.loading && (
                    <span className="ms-ss-status-hint">Leave empty to use the shared key</span>
                  )}
                </div>

                {mlStatus.remaining != null && (
                  <div className={`ms-ss-usage${mlExhausted ? ' ms-ss-usage--exhausted' : ''}`}>
                    <span className="ms-ss-usage__value">
                      {mlStatus.limit != null
                        ? `${mlStatus.remaining}/${mlStatus.limit}`
                        : `${mlStatus.remaining}`}
                    </span>
                    <span className="ms-ss-usage__label">
                      {usingPersonalMlKey ? 'available on your key' : 'available on shared key'}
                    </span>
                    {mlStatus.resetAt != null && (
                      <span className="ms-ss-usage__reset">{formatResetTime(mlStatus.resetAt)}</span>
                    )}
                  </div>
                )}
                {mlExhausted && (
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
