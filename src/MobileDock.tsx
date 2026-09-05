import { useEffect, useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Download,
  Globe,
  HelpCircle,
  Keyboard,
  LayoutTemplate,
  Magnet,
  Moon,
  MoreHorizontal,
  Settings,
  Smartphone,
  Sun,
} from 'lucide-react';
import { LAYOUT_PRESETS } from './layoutPresets';
import {
  ARTBOARD_FORMATS,
  SIZE_SCALE_PRESETS,
  type ArtboardFormatId,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import type { ScreenshotProvider } from './screenshotProviders';

const EXPORT_FORMATS = new Set<ExportFormat>(['png', 'jpg']);
const EXPORT_RESOLUTIONS = new Set<ExportResolution>([
  'best',
  '1440p',
  '1080p',
  '720p',
]);

type MobileDockProps = {
  hasDevices: boolean;
  isExporting: boolean;
  websiteUrlDraft: string;
  onWebsiteUrlDraftChange: (value: string) => void;
  onApplyUrl: (url: string) => void;
  onClearUrl: () => void;
  websiteUrlActive: boolean;
  captureBusy: boolean;
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportTransparentBg: boolean;
  onExportFormat: (v: ExportFormat) => void;
  onExportResolution: (v: ExportResolution) => void;
  onExportTransparentBg: (v: boolean) => void;
  onDownload: () => void;
  onDevices: () => void;
  onApplyPreset: (id: string) => void;
  artboardFormatId: ArtboardFormatId;
  onArtboardFormat: (id: ArtboardFormatId) => void;
  sizeScaleId: SizeScaleId;
  onSizeScale: (id: SizeScaleId) => void;
  snapEnabled: boolean;
  onSnapEnabled: (v: boolean) => void;
  onAlignH: () => void;
  onAlignV: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  canReorder: boolean;
  hasSelection: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  screenshotProvider: ScreenshotProvider;
  onScreenshotProviderChange: (provider: ScreenshotProvider) => void;
  screenshotApiKey: string;
  onScreenshotApiKeyChange: (key: string) => void;
  microlinkApiKey: string;
  onMicrolinkApiKeyChange: (key: string) => void;
  onOpenShortcuts: () => void;
  onTakeTour?: () => void;
};

type SheetId = 'url' | 'more' | null;

function parseExportFormat(value: string): ExportFormat | null {
  return EXPORT_FORMATS.has(value as ExportFormat) ? (value as ExportFormat) : null;
}

function parseExportResolution(value: string): ExportResolution | null {
  return EXPORT_RESOLUTIONS.has(value as ExportResolution)
    ? (value as ExportResolution)
    : null;
}

function downloadLabel(downloading: boolean): string {
  return downloading ? 'Downloading…' : 'Download';
}

export default function MobileDock({
  hasDevices,
  isExporting,
  websiteUrlDraft,
  onWebsiteUrlDraftChange,
  onApplyUrl,
  onClearUrl,
  websiteUrlActive,
  captureBusy,
  exportFormat,
  exportResolution,
  exportTransparentBg,
  onExportFormat,
  onExportResolution,
  onExportTransparentBg,
  onDownload,
  onDevices,
  onApplyPreset,
  artboardFormatId,
  onArtboardFormat,
  sizeScaleId,
  onSizeScale,
  snapEnabled,
  onSnapEnabled,
  onAlignH,
  onAlignV,
  onBringForward,
  onSendBackward,
  canReorder,
  hasSelection,
  theme,
  onToggleTheme,
  screenshotProvider,
  onScreenshotProviderChange,
  screenshotApiKey,
  onScreenshotApiKeyChange,
  microlinkApiKey,
  onMicrolinkApiKeyChange,
  onOpenShortcuts,
  onTakeTour,
}: Readonly<MobileDockProps>) {
  const [openSheet, setOpenSheet] = useState<SheetId>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const open = (id: SheetId) => setOpenSheet(id);
  const close = () => setOpenSheet(null);
  const closeAll = () => {
    close();
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (openSheet === 'url') {
      queueMicrotask(() => urlInputRef.current?.focus());
    }
  }, [openSheet]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const sheet = sheetRef.current;
      if (sheet) {
        const target = e.target as HTMLElement;
        if (!sheet.contains(target)) {
          close();
        }
      }
      const settings = settingsRef.current;
      if (settings) {
        const target = e.target as HTMLElement;
        if (!settings.contains(target)) {
          setSettingsOpen(false);
        }
      }
    };
    if (openSheet || settingsOpen) {
      window.addEventListener('pointerdown', onPointerDown);
      return () => window.removeEventListener('pointerdown', onPointerDown);
    }
  }, [openSheet, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyUrl(websiteUrlDraft);
    close();
  };

  const toggleUrl = () => open(openSheet === 'url' ? null : 'url');
  const toggleMore = () => open(openSheet === 'more' ? null : 'more');
  const toggleSettings = () => {
    setSettingsOpen((v) => !v);
    close();
  };

  return (
    <>
      <nav className="ms-mobile-dock" aria-label="Quick actions">
        <button
          type="button"
          className="ms-mobile-dock__btn"
          aria-label="Devices"
          onClick={() => {
            closeAll();
            onDevices();
          }}
        >
          <Smartphone size={18} strokeWidth={1.75} aria-hidden />
          <span className="ms-mobile-dock__label">Devices</span>
        </button>

        <button
          type="button"
          className={`ms-mobile-dock__btn${openSheet === 'url' ? ' is-active' : ''}`}
          aria-label="Website URL"
          aria-pressed={openSheet === 'url'}
          onClick={() => {
            closeAll();
            toggleUrl();
          }}
        >
          <Globe size={18} strokeWidth={1.75} aria-hidden />
          <span className="ms-mobile-dock__label">URL</span>
        </button>

        {hasDevices ? (
          <button
            type="button"
            className="ms-mobile-dock__btn ms-mobile-dock__btn--accent"
            disabled={isExporting}
            aria-busy={isExporting}
            onClick={() => {
              closeAll();
              onDownload();
            }}
          >
            <Download size={18} strokeWidth={1.75} aria-hidden />
            <span className="ms-mobile-dock__label">{downloadLabel(isExporting)}</span>
          </button>
        ) : null}

        <button
          type="button"
          className={`ms-mobile-dock__btn${openSheet === 'more' ? ' is-active' : ''}`}
          aria-label="More tools"
          aria-pressed={openSheet === 'more'}
          onClick={() => {
            setSettingsOpen(false);
            toggleMore();
          }}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />
          <span className="ms-mobile-dock__label">More</span>
        </button>

        <div className="ms-mobile-dock__menu-wrap" ref={settingsRef}>
          <button
            type="button"
            className={`ms-mobile-dock__btn${settingsOpen ? ' is-active' : ''}`}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-haspopup="menu"
            onClick={toggleSettings}
          >
            <Settings size={18} strokeWidth={1.75} aria-hidden />
            <span className="ms-mobile-dock__label">Settings</span>
          </button>
          {settingsOpen ? (
            <div className="ms-mobile-dock__settings-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="ms-menu__item ms-menu__item--with-icon"
                onClick={() => {
                  onToggleTheme();
                  setSettingsOpen(false);
                }}
              >
                {theme === 'dark' ? (
                  <Sun size={16} strokeWidth={1.75} aria-hidden />
                ) : (
                  <Moon size={16} strokeWidth={1.75} aria-hidden />
                )}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <div className="ms-menu__separator" aria-hidden />
              <div className="ms-menu__label">Screenshot provider</div>
              <select
                className="ms-menu__select"
                value={screenshotProvider}
                onChange={(e) => {
                  onScreenshotProviderChange(
                    (e.target.value as string) === 'playwright' ? 'playwright'
                      : (e.target.value as string) === 'screenshotapi' ? 'screenshotapi'
                      : 'microlink'
                  );
                }}
              >
                <option value="playwright">Local (Playwright)</option>
                <option value="screenshotapi">ScreenshotAPI</option>
                <option value="microlink">Microlink</option>
              </select>
              {screenshotProvider === 'screenshotapi' && (
                <label className="ms-menu__label" style={{ marginTop: 4 }}>
                  API key
                  <input
                    className="ms-menu__input"
                    type="password"
                    placeholder="screenshotapi.to key"
                    value={screenshotApiKey}
                    onChange={(e) => onScreenshotApiKeyChange(e.target.value)}
                  />
                </label>
              )}
              {screenshotProvider === 'microlink' && (
                <label className="ms-menu__label" style={{ marginTop: 4 }}>
                  API key
                  <input
                    className="ms-menu__input"
                    type="password"
                    placeholder="Microlink API key (optional)"
                    value={microlinkApiKey}
                    onChange={(e) => onMicrolinkApiKeyChange(e.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                role="menuitem"
                className="ms-menu__item ms-menu__item--with-icon"
                onClick={() => {
                  onOpenShortcuts();
                  setSettingsOpen(false);
                }}
              >
                <Keyboard size={16} strokeWidth={1.75} aria-hidden />
                Keyboard shortcuts
              </button>
              {onTakeTour ? (
                <button
                  type="button"
                  role="menuitem"
                  className="ms-menu__item ms-menu__item--with-icon"
                  onClick={() => {
                    onTakeTour();
                    setSettingsOpen(false);
                  }}
                >
                  <HelpCircle size={16} strokeWidth={1.75} aria-hidden />
                  Take tour
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </nav>

      {openSheet ? (
        <div className="ms-mobile-dock__sheet-backdrop" role="presentation" onClick={close}>
          <div
            ref={sheetRef}
            className="ms-mobile-dock__sheet"
            role="dialog"
            aria-modal="true"
            aria-label={openSheet === 'url' ? 'Website URL' : 'More tools'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ms-mobile-dock__sheet-handle" />

            {openSheet === 'url' ? (
              <form className="ms-mobile-dock__url-form" onSubmit={handleUrlSubmit}>
                <label className="ms-sr-only" htmlFor="ms-mobile-url-input">
                  Website URL
                </label>
                <input
                  ref={urlInputRef}
                  id="ms-mobile-url-input"
                  className="ms-mobile-dock__url-input"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  placeholder="google.com"
                  value={websiteUrlDraft}
                  aria-busy={captureBusy}
                  onChange={(e) => onWebsiteUrlDraftChange(e.target.value)}
                />
                <div className="ms-mobile-dock__url-actions">
                  {(websiteUrlActive || websiteUrlDraft.trim()) ? (
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      onClick={() => {
                        onClearUrl();
                        close();
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                  <button type="submit" className="ms-btn ms-btn--accent">
                    Apply
                  </button>
                </div>
              </form>
            ) : null}

            {openSheet === 'more' ? (
              <div className="ms-mobile-dock__sections">
                <section className="ms-mobile-dock__section">
                  <h3 className="ms-mobile-dock__section-title">
                    <LayoutTemplate size={16} strokeWidth={1.75} aria-hidden /> Layouts
                  </h3>
                  <div className="ms-mobile-dock__menu-grid">
                    {LAYOUT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="ms-mobile-dock__menu-item"
                        onClick={() => {
                          onApplyPreset(preset.id);
                          close();
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="ms-mobile-dock__section">
                  <h3 className="ms-mobile-dock__section-title">Canvas</h3>
                  <label className="ms-field">
                    <span className="ms-field__label">Canvas size</span>
                    <select
                      value={artboardFormatId}
                      onChange={(e) => {
                        const id = e.target.value as ArtboardFormatId;
                        if (ARTBOARD_FORMATS.some((p) => p.id === id)) {
                          onArtboardFormat(id);
                        }
                      }}
                    >
                      {ARTBOARD_FORMATS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ms-field">
                    <span className="ms-field__label">Device size</span>
                    <select
                      value={sizeScaleId}
                      onChange={(e) => {
                        const id = e.target.value as SizeScaleId;
                        if (SIZE_SCALE_PRESETS.some((p) => p.id === id)) {
                          onSizeScale(id);
                        }
                      }}
                    >
                      {SIZE_SCALE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ms-check">
                    <input
                      type="checkbox"
                      checked={snapEnabled}
                      onChange={(e) => onSnapEnabled(e.target.checked)}
                    />
                    <Magnet size={14} strokeWidth={1.75} aria-hidden />
                    Snap to edges
                  </label>
                  <div className="ms-mobile-dock__row">
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      disabled={!hasSelection}
                      onClick={() => {
                        onAlignH();
                        close();
                      }}
                    >
                      <AlignHorizontalJustifyCenter size={16} aria-hidden />
                      Align H
                    </button>
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      disabled={!hasSelection}
                      onClick={() => {
                        onAlignV();
                        close();
                        }}
                    >
                      <AlignVerticalJustifyCenter size={16} aria-hidden />
                      Align V
                    </button>
                  </div>
                  <div className="ms-mobile-dock__row">
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      disabled={!canReorder}
                      onClick={() => {
                        onBringForward();
                        close();
                      }}
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      disabled={!canReorder}
                      onClick={() => {
                        onSendBackward();
                        close();
                      }}
                    >
                      Backward
                    </button>
                  </div>
                </section>

                <section className="ms-mobile-dock__section">
                  <h3 className="ms-mobile-dock__section-title">Export</h3>
                  <label className="ms-field">
                    <span className="ms-field__label">Format</span>
                    <select
                      value={exportFormat}
                      onChange={(e) => {
                        const next = parseExportFormat(e.target.value);
                        if (next) onExportFormat(next);
                      }}
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </label>
                  <label className="ms-field">
                    <span className="ms-field__label">Resolution</span>
                    <select
                      value={exportResolution}
                      onChange={(e) => {
                        const next = parseExportResolution(e.target.value);
                        if (next) onExportResolution(next);
                      }}
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
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
