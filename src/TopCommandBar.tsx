import { Download, Ellipsis, X } from 'lucide-react';
import type { ExportFormat, ExportResolution } from './deviceScale';

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
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportTransparentBg: boolean;
  onExportFormat: (v: ExportFormat) => void;
  onExportResolution: (v: ExportResolution) => void;
  onExportTransparentBg: (v: boolean) => void;
  onDownload: () => void;
  downloadMenuOpen: boolean;
  onDownloadMenuOpenChange: (open: boolean) => void;
  downloadMenuRef: React.RefObject<HTMLDivElement | null>;
};

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
  exportFormat,
  exportResolution,
  exportTransparentBg,
  onExportFormat,
  onExportResolution,
  onExportTransparentBg,
  onDownload,
  downloadMenuOpen,
  onDownloadMenuOpenChange,
  downloadMenuRef,
}: Props) {
  return (
    <header className="ms-top-command">
      <h1 className="ms-brand">Pixel Mockup</h1>

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
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://your-site.com"
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
              <X size={16} strokeWidth={1.75} aria-hidden />
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

      {hasDevices ? (
        <div className="ms-download-cluster" ref={downloadMenuRef}>
          <button
            type="button"
            className="ms-btn ms-btn--accent ms-btn--download"
            disabled={downloading}
            aria-busy={downloading}
            title={
              softEmptyDownload
                ? 'Screens look empty — click again to download anyway'
                : undefined
            }
            onClick={onDownload}
          >
            <Download size={16} strokeWidth={1.75} aria-hidden />
            {downloading
              ? 'Downloading…'
              : softEmptyDownload
                ? 'Download anyway'
                : 'Download'}
          </button>
          <button
            type="button"
            className="ms-icon-btn"
            aria-label="Download options"
            title="Download options"
            aria-expanded={downloadMenuOpen}
            aria-haspopup="menu"
            onClick={() => onDownloadMenuOpenChange(!downloadMenuOpen)}
          >
            <Ellipsis size={18} strokeWidth={1.75} aria-hidden />
          </button>
          {downloadMenuOpen ? (
            <div className="ms-menu ms-download-menu" role="menu">
              <label className="ms-field">
                <span className="ms-field__label">Format</span>
                <select
                  value={exportFormat}
                  onChange={(e) =>
                    onExportFormat(e.target.value as ExportFormat)
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </label>
              <label className="ms-field">
                <span className="ms-field__label">Resolution</span>
                <select
                  value={exportResolution}
                  onChange={(e) =>
                    onExportResolution(e.target.value as ExportResolution)
                  }
                >
                  <option value="best">Best</option>
                  <option value="1440p">1440p</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <label className="ms-check">
                <input
                  type="checkbox"
                  checked={exportTransparentBg && exportFormat !== 'jpg'}
                  disabled={exportFormat === 'jpg'}
                  onChange={(e) => onExportTransparentBg(e.target.checked)}
                />
                Transparent background
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
