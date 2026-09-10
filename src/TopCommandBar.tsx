import { Download, X } from 'lucide-react';
import BrandMark from './BrandMark';
import type { CreditState } from './useCredits';
import { formatResetTime } from './utils/formatResetTime';
import type { ScreenshotProvider } from './screenshotProviders';  // ← ADD

type Props = {
  hasDevices: boolean;
  websiteUrlDraft: string;
  onWebsiteUrlDraftChange: (value: string) => void;
  onApplyUrl: (url: string) => void;
  onClearUrl: () => void;
  websiteUrlActive: boolean;
  captureBusy: boolean;
  captureCount: number;
  downloading: boolean;
  softEmptyDownload: boolean;
  onDownload: () => void;
  credits: CreditState;
  onOpenScreenshotSettings: () => void;
  screenshotProvider: ScreenshotProvider;
};

function downloadLabel(downloading: boolean, softEmptyDownload: boolean): string {
  if (downloading) return 'Downloading...';
  if (softEmptyDownload) return 'Download anyway';
  return 'Download';
}

export default function TopCommandBar({
  hasDevices,
  websiteUrlDraft,
  onWebsiteUrlDraftChange,
  onApplyUrl,
  onClearUrl,
  websiteUrlActive,
  captureBusy,
  captureCount,
  downloading,
  softEmptyDownload,
  onDownload,
  credits,
  onOpenScreenshotSettings,
  screenshotProvider,
}: Readonly<Props>) {
  const ml = credits.microlink;
  const mlExhausted = ml.remaining !== null && ml.remaining <= 0;

  return (
    <header className="ms-top-command">
      <BrandMark />

      {hasDevices ? (
        <form
          className="ms-url-command"
          onSubmit={(e) => {
            e.preventDefault();
            onApplyUrl(websiteUrlDraft);
          }}
        >
          <label className="ms-sr-only" htmlFor="ms-url-command-input">
            Website URL
          </label>
          <input
            id="ms-url-command-input"
            className="ms-url-command__input"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="google.com"
            value={websiteUrlDraft}
            onChange={(e) => onWebsiteUrlDraftChange(e.target.value)}
            aria-busy={captureBusy}
          />
          {websiteUrlActive || websiteUrlDraft.trim() ? (
            <button
              type="button"
              className="ms-icon-btn ms-url-command__clear"
              aria-label="Clear website"
              title="Clear website"
              onClick={onClearUrl}
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          <button
            type="submit"
            className="ms-btn ms-btn--ghost ms-url-command__apply"
          >
            Apply
          </button>
          {captureBusy ? (
            <span className="ms-capture-pill" role="status" aria-live="polite">
              Updating {captureCount}…
            </span>
          ) : null}
        </form>
      ) : (
        <div className="ms-top-command__spacer" aria-hidden />
      )}

      <div className="ms-top-command__end">
        {(() => {
          const provider = screenshotProvider;

          // --- SCREENSHOTAPI DYNAMIC DISPLAY ---
          if (provider === 'screenshotapi') {
            const saRemaining = credits.screenshotapi;
            const saLimit = credits.screenshotapiLimit ?? 200; // Dynamic fallback

            return (
              <button
                type="button"
                className="ms-presence-pill ms-presence-pill--clickable"
                role="button"
                title="ScreenshotAPI credits — click for API & keys"
                aria-label="ScreenshotAPI credits — click to manage API and keys"
                onClick={onOpenScreenshotSettings}
              >
                <span className="ms-presence-pill__dot" aria-hidden />
                {saRemaining != null
                  ? `${saRemaining}/${saLimit}(per month) `
                  : `${saLimit}(per month) `}ScreenshotAPI
              </button>
            );
          }

          // --- MICROLINK DYNAMIC DISPLAY ---
          if (provider === 'microlink' && credits.microlink.remaining != null) {
            const mlLimit = credits.microlink.limit ?? 25; // Dynamic fallback

            return (
              <button
                type="button"
                className={[
                  'ms-presence-pill',
                  'ms-presence-pill--clickable',
                  mlExhausted ? 'ms-presence-pill--exhausted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                title={
                  mlExhausted
                    ? 'Shared Microlink key is used up for today — click for details'
                    : 'Microlink shared key availability — click to manage'
                }
                aria-label="Microlink shared key usage — click to open API and keys"
                onClick={onOpenScreenshotSettings}
              >
                <span className="ms-presence-pill__dot" aria-hidden />
                {mlExhausted ? (
                  <>Microlink used{ml.resetAt != null ? ` — ${formatResetTime(ml.resetAt)}` : ''}</>
                ) : (
                  <>
                    {(`${ml.remaining}/${mlLimit}(per day) `)}Microlink
                  </>
                )}
              </button>
            );
          }
          return null;
        })()}

        <div className="ms-download-cluster">
          <button
            type="button"
            className="ms-btn ms-btn--accent ms-btn--download"
            disabled={!hasDevices || downloading}
            aria-busy={downloading}
            title={
              !hasDevices
                ? 'Add a device first to download your mockup'
                : softEmptyDownload
                  ? 'Screens look empty — click again to download anyway'
                  : undefined
            }
            onClick={onDownload}
          >
            <Download size={16} strokeWidth={1.75} aria-hidden />
            <span className="ms-btn__label">
              {downloadLabel(downloading, softEmptyDownload)}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
