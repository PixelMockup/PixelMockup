import { useState, useEffect, useCallback } from 'react';
import type { Provider, SaStatus } from '../types/screenshot';
import { formatResetTime, hasResetTimePassed } from '../utils/formatResetTime';
import {
  getScreenshotProvider,
  setScreenshotProvider,
  getScreenshotApiKey,
  setScreenshotApiKey,
  // getMicrolinkApiKey,
  // setMicrolinkApiKey,
} from '../screenshotProviders';
import type { CreditState } from '../useCredits';

interface ScreenshotSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  credits: CreditState;
  onNotify: (msg: string, tone?: 'info' | 'error') => void;
  updateUsage: (provider: 'microlink' | 'screenshotapi', usage: any) => void;
  refreshCredits: () => Promise<void>;
  onProviderChange?: (provider: Provider) => void;
}

const SCREENSHOT_API_KEYS_URL = 'https://screenshotapi.to';
// const MICROLINK_KEYS_URL = 'https://microlink.io/docs';

export default function ScreenshotSettings({
  isOpen,
  onClose,
  credits,
  onNotify,
  updateUsage,
  refreshCredits,
  onProviderChange,
}: ScreenshotSettingsProps) {
  // Props from MockupStudio feed the live global credit state (no shadow hook)
  const [view, setView] = useState<Provider>(() =>
    getScreenshotProvider() === 'screenshotapi' ? 'screenshotapi' : 'microlink',
  );
  const [saKey, setSaKeyState] = useState(getScreenshotApiKey);
  // const [mlKey, setMlKeyState] = useState(getMicrolinkApiKey);
  const [saStatus, setSaStatus] = useState<SaStatus>({ valid: null });
  const [_resetTick, setResetTick] = useState(0);

  // Derive Microlink status directly from the live credits state
  const ml = credits?.microlink ?? { remaining: null, limit: null, resetAt: null };
  const mlExhausted = ml.remaining != null && ml.remaining <= 0;
  const usingPersonalMlKey = ml.tier === 'paid' || ml.tier === 'pro' || ml.tier === 'enterprise';

  useEffect(() => {
    if (!isOpen) return;
    const stored = getScreenshotProvider();
    setView(stored === 'screenshotapi' ? 'screenshotapi' : 'microlink');
    setSaKeyState(getScreenshotApiKey());
    // setMlKeyState(getMicrolinkApiKey());
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

  // const handleMlKeyChange = useCallback((key: string) => {
  //   setMlKeyState(key);
  //   setMicrolinkApiKey(key);
  // }, []);

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
          updateUsage('screenshotapi', { remaining: creditsRemaining, limit, resetAt });
        } catch (err) {
          console.log('Failed to update ScreenshotAPI credits state: ', err);
        }
      }
    } catch {
      setSaStatus({ valid: false, reason: 'network_error', loading: false });
    }
  }, [saKey, updateUsage]);

  const handleViewScreenshotApi = useCallback(() => {
    setView('screenshotapi');
  }, []);

  const handleViewMicrolink = useCallback(() => {
    setView('microlink');
  }, []);

  const handleUseScreenshotApi = useCallback(() => {
    // Allow using ScreenshotAPI with no validated key (public access) or with key
    const useKeyCredits = saStatus.valid === true;
    updateUsage('screenshotapi', useKeyCredits ? {
      remaining: saStatus.creditsRemaining ?? null,
      limit: 200,
      resetAt: null,
      remainingwithoutapi: null,
      limitwithoutapi: null,
    } : {
      remaining: null,
      limit: null,
      resetAt: null,
      remainingwithoutapi: credits.screenshotapi.remainingwithoutapi ?? null,
      limitwithoutapi: credits.screenshotapi.limitwithoutapi ?? 8,
    });
    setScreenshotProvider('screenshotapi');
    onProviderChange?.('screenshotapi');
    onNotify('Using ScreenshotAPI');
    onClose();
  }, [saStatus, credits, onNotify, onProviderChange, onClose, updateUsage]);

  const handleUseMicrolink = useCallback(() => {
    updateUsage('microlink', { remaining: null, limit: 25, resetAt: null });
    setScreenshotProvider('microlink');
    onNotify('Using Microlink');
    onClose();
    onProviderChange?.('microlink');
  }, [onNotify, onClose, onProviderChange, updateUsage]);

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
            <h2>API &amp; Keys</h2>
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
                  <span className="ms-ss-badge ms-ss-badge--optional">Shared key</span>
                </div>
                <p className="ms-ss-desc">
                  Free ~200 requests per month with API key, ~8 requests per minute without API key.
                </p>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {ml.resetAt ? (`Reset at ${new Date(ml.resetAt * 1000).toUTCString()}`) : ''}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  {saStatus.valid !== true && (credits.screenshotapi?.limitwithoutapi != null || credits.screenshotapi?.remainingwithoutapi != null) && (
                    <span style={{ marginLeft: 12 }}>
                      {credits.screenshotapi.remainingwithoutapi ?? '-'} / {credits.screenshotapi.limitwithoutapi ?? '-'}
                      . Refresh in: {Math.max(0, 60 - (new Date().getSeconds()))}s
                    </span>
                  )}
                  {saStatus.valid === true && credits.screenshotapi?.limit != null && (
                    <span style={{ marginLeft: 12 }}>
                      {credits.screenshotapi.remaining ?? '-'}/{credits.screenshotapi.limit}
                    </span>
                  )}
                </div>
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
                {/*TODO: Implement 24h countdown*/}
                {/* Microlink key input commented out per user request */}
                {/*
                <div className="ms-ss-key-row">
                  <input
                    type="password"
                    className="ms-ss-key-input"
                  placeholder="Microlink API key (optional)"
                    value={mlKey}
                    onChange={(e) => handleMlKeyChange(e.target.value)}
                  />
                </div>
                */}

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
                {/* 
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
                  */}
              </div>
            </div>
          )}
        </div>

        <div className="ms-modal-actions">
          <button
            type="button"
            className="ms-btn ms-btn--primary"
            disabled={false}
            onClick={view === 'screenshotapi' ? handleUseScreenshotApi : handleUseMicrolink}
          >
            {view === 'screenshotapi' ? 'Use ScreenshotAPI' : 'Use Microlink'}
          </button>
        </div>
      </div>
    </dialog >
  );
}
