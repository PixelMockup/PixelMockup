import { useEffect, useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Bug,
  HelpCircle,
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
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportTransparentBg: boolean;
  onExportFormat: (v: ExportFormat) => void;
  onExportResolution: (v: ExportResolution) => void;
  onExportTransparentBg: (v: boolean) => void;
  onDevices: () => void;
  closeDevices: () => void;
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
  onTakeTour?: () => void;
};

type SheetId = 'more' | 'settings' | null;

function parseExportFormat(value: string): ExportFormat | null {
  return EXPORT_FORMATS.has(value as ExportFormat) ? (value as ExportFormat) : null;
}

function parseExportResolution(value: string): ExportResolution | null {
  return EXPORT_RESOLUTIONS.has(value as ExportResolution)
    ? (value as ExportResolution)
    : null;
}

export default function MobileDock({
  exportFormat,
  exportResolution,
  exportTransparentBg,
  onExportFormat,
  onExportResolution,
  onExportTransparentBg,
  onDevices,
  closeDevices,
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
  onTakeTour,
}: Readonly<MobileDockProps>) {
  const [openSheet, setOpenSheet] = useState<SheetId>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  const close = () => setOpenSheet(null);
  const closeAll = () => {
    close();
    closeDevices();
  };

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (navRef.current?.contains(target)) return;

      const sheet = sheetRef.current;
      if (sheet && !sheet.contains(target)) {
        close();
      }
    };
    if (openSheet) {
      window.addEventListener('pointerdown', onPointerDown);
      return () => window.removeEventListener('pointerdown', onPointerDown);
    }
  }, [openSheet]);

  return (
    <>
      <nav ref={navRef} className="ms-mobile-dock" aria-label="Quick actions">
        <button
          type="button"
          className="ms-mobile-dock__btn"
          aria-label="Devices"
          title="Devices"
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
          className="ms-mobile-dock__btn"
          aria-label="More"
          title="More"
          onClick={() => {
            closeAll();
            setOpenSheet('more');
          }}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />
          <span className="ms-mobile-dock__label">More</span>
        </button>

        <button
          type="button"
          className="ms-mobile-dock__btn"
          aria-label="Settings"
          title="Settings"
          onClick={() => {
            closeAll();
            setOpenSheet('settings');
          }}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden />
          <span className="ms-mobile-dock__label">Settings</span>
        </button>
      </nav>

      {openSheet ? (
        <div className="ms-mobile-dock__sheet-backdrop" role="presentation" onClick={close}>
          <div
            ref={sheetRef}
            className="ms-mobile-dock__sheet"
            role="dialog"
            aria-modal="true"
            aria-label={openSheet === 'more' ? 'More' : 'Settings'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ms-mobile-dock__sheet-header">
              <h3 className="ms-mobile-dock__sheet-title">{openSheet === 'more' ? 'More' : 'Settings'}</h3>
              <button
                type="button"
                className="ms-btn ms-btn--ghost"
                onClick={close}
                aria-label="Close"
              >
                Close
              </button>
            </div>

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

            {openSheet === 'settings' ? (
              <div className="ms-mobile-dock__sections">
                <section className="ms-mobile-dock__section">
                  <h3 className="ms-mobile-dock__section-title">Appearance</h3>
                  <div className="ms-mobile-dock__section-body">
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      style={{ width: '100%' }}
                      onClick={() => {
                        onToggleTheme();
                        close();
                      }}
                    >
                      {theme === 'dark' ? (
                        <Sun size={16} strokeWidth={1.75} aria-hidden />
                      ) : (
                        <Moon size={16} strokeWidth={1.75} aria-hidden />
                      )}
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </button>
                  </div>
                </section>

                <section className="ms-mobile-dock__section">
                  <h3 className="ms-mobile-dock__section-title">Screenshot provider</h3>
                  <div className="ms-mobile-dock__section-body">
                    <label className="ms-field">
                      <span className="ms-field__label">Provider</span>
                      <select
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
                    </label>
                    {screenshotProvider === 'screenshotapi' && (
                      <label className="ms-field" style={{ marginTop: 8 }}>
                        <span className="ms-field__label">API key</span>
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
                      <label className="ms-field" style={{ marginTop: 8 }}>
                        <span className="ms-field__label">API key</span>
                        <input
                          className="ms-menu__input"
                          type="password"
                          placeholder="Microlink API key (optional)"
                          value={microlinkApiKey}
                          onChange={(e) => onMicrolinkApiKeyChange(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </section>

                <section className="ms-mobile-dock__section">
                  <div className="ms-mobile-dock__section-body">
                    {onTakeTour ? (
                      <button
                        type="button"
                        className="ms-btn ms-btn--ghost"
                        style={{ width: '100%' }}
                        onClick={() => {
                          onTakeTour();
                          close();
                        }}
                      >
                        <HelpCircle size={16} strokeWidth={1.75} aria-hidden />
                        Take Tour
                      </button>
                    ) : null}
                    <a
                      href="https://github.com/PixelMockup/PixelMockup/issues"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ms-btn ms-btn--ghost"
                      style={{ width: '100%', textDecoration: 'none' }}
                    >
                      <Bug size={16} strokeWidth={1.75} aria-hidden />
                      Report a bug
                    </a>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
