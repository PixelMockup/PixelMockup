import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Bug,
  KeyRound,
  HelpCircle,
  Keyboard,
  LayoutTemplate,
  Magnet,
  Moon,
  Settings,
  Smartphone,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LAYOUT_PRESETS } from './layoutPresets';
import {
  ARTBOARD_FORMATS,
  SIZE_SCALE_PRESETS,
  type ArtboardFormatId,
  type SizeScaleId,
  type ExportFormat,
  type ExportResolution,
} from './deviceScale';

type Props = {
  devicesOpen: boolean;
  onToggleDevices: () => void;
  layoutsOpen: boolean;
  onLayoutsOpenChange: (open: boolean) => void;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  placing: boolean;
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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenScreenshotSettings: () => void;
  onOpenShortcuts: () => void;
  onTakeTour?: () => void;
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportTransparentBg: boolean;
  onExportFormat: (v: ExportFormat) => void;
  onExportResolution: (v: ExportResolution) => void;
  onExportTransparentBg: (v: boolean) => void;
  layoutsRef: React.RefObject<HTMLDivElement | null>;
  moreRef: React.RefObject<HTMLDivElement | null>;
};

export default function IconRail({
  devicesOpen,
  onToggleDevices,
  layoutsOpen,
  onLayoutsOpenChange,
  moreOpen,
  onMoreOpenChange,
  placing,
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
  theme,
  onToggleTheme,
  onOpenScreenshotSettings,
  onOpenShortcuts,
  onTakeTour,
  exportFormat,
  exportResolution,
  exportTransparentBg,
  onExportFormat,
  onExportResolution,
  onExportTransparentBg,
  layoutsRef,
  moreRef,
}: Readonly<Props>) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const wrap = settingsRef.current;
      if (!wrap) return;
      const target = e.target as HTMLElement;
      if (!wrap.contains(target)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [settingsOpen]);

  const closeOtherMenus = () => {
    onLayoutsOpenChange(false);
    onMoreOpenChange(false);
  };

  return (
    <nav className="ms-icon-rail" aria-label="Studio tools">
      <button
        type="button"
        className={`ms-rail-btn ms-rail-devices${devicesOpen ? ' is-active' : ''}`}
        aria-pressed={devicesOpen}
        aria-expanded={devicesOpen}
        aria-haspopup="dialog"
        aria-controls="ms-device-library"
        aria-label={devicesOpen ? 'Hide devices' : 'Devices'}
        title="Devices"
        onClick={() => {
          onToggleDevices();
          closeOtherMenus();
          setSettingsOpen(false);
        }}
      >
        <Smartphone size={20} strokeWidth={1.5} aria-hidden />
      </button>

      <div className="ms-rail-menu-wrap" ref={layoutsRef}>
        <button
          type="button"
          className={`ms-rail-btn${layoutsOpen ? ' is-active' : ''}`}
          aria-expanded={layoutsOpen}
          aria-haspopup="menu"
          aria-label="Layouts"
          title="Layouts"
          disabled={placing}
          onClick={() => {
            onLayoutsOpenChange(!layoutsOpen);
            onMoreOpenChange(false);
            setSettingsOpen(false);
            if (devicesOpen) onToggleDevices();
          }}
        >
          <LayoutTemplate size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {layoutsOpen ? (
          <div className="ms-menu ms-rail-menu" role="menu" aria-label="Layouts">
            <h3 className="ms-rail-menu-title">Layouts</h3>
            {LAYOUT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className="ms-menu__item"
                disabled={placing}
                onClick={() => {
                  onApplyPreset(p.id);
                  onLayoutsOpenChange(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ms-rail-menu-wrap" ref={moreRef}>
        <button
          type="button"
          className={`ms-rail-btn${moreOpen ? ' is-active' : ''}`}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-label="Canvas Settings"
          title="Canvas Settings"
          onClick={() => {
            onMoreOpenChange(!moreOpen);
            onLayoutsOpenChange(false);
            setSettingsOpen(false);
            if (devicesOpen) onToggleDevices();
          }}
        >
          <SlidersHorizontal size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {moreOpen ? (
          <div className="ms-menu ms-rail-menu ms-rail-menu--wide" role="menu" aria-label="Canvas Settings">
            <h3 className="ms-rail-menu-title">Canvas Settings</h3>
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
            <div className="ms-menu__row">
              <button
                type="button"
                className="ms-btn ms-btn--ghost"
                onClick={onAlignH}
                title="Align horizontal centers"
              >
                <AlignHorizontalJustifyCenter size={16} aria-hidden />
                Align H
              </button>
              <button
                type="button"
                className="ms-btn ms-btn--ghost"
                onClick={onAlignV}
                title="Align vertical centers"
              >
                <AlignVerticalJustifyCenter size={16} aria-hidden />
                Align V
              </button>
            </div>
            <div className="ms-menu__row">
              <button
                type="button"
                className="ms-btn ms-btn--ghost"
                disabled={!canReorder}
                onClick={onBringForward}
              >
                Forward
              </button>
              <button
                type="button"
                className="ms-btn ms-btn--ghost"
                disabled={!canReorder}
                onClick={onSendBackward}
              >
                Backward
              </button>
            </div>
            <label className="ms-field">
              <span className="ms-field__label">Format</span>
              <select
                value={exportFormat}
                onChange={(e) => {
                  const next = e.target.value as ExportFormat;
                  if (next === 'png' || next === 'jpg') {
                    onExportFormat(next);
                  }
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
                  const next = e.target.value as ExportResolution;
                  if (['best', '1440p', '1080p', '720p'].includes(next)) {
                    onExportResolution(next);
                  }
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
              /> {''}
              Transparent background
            </label>
          </div>
        ) : null}
      </div>

      <div className="ms-icon-rail__spacer" />

      <div className="ms-rail-menu-wrap" ref={settingsRef}>
        <button
          type="button"
          className={`ms-rail-btn${settingsOpen ? ' is-active' : ''}`}
          aria-label="Settings"
          aria-expanded={settingsOpen}
          aria-haspopup="menu"
          title="Settings"
          onClick={() => {
            setSettingsOpen((v) => !v);
            closeOtherMenus();
            if (devicesOpen) onToggleDevices();
          }}
        >
          <Settings size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {settingsOpen ? (
          <div className="ms-menu ms-rail-menu ms-rail-menu--settings" role="menu" aria-label="Settings">
            <h3 className="ms-rail-menu-title">Settings</h3>
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
            <button
              type="button"
              role="menuitem"
              className="ms-menu__item ms-menu__item--with-icon"
              onClick={() => {
                onOpenScreenshotSettings();
                setSettingsOpen(false);
              }}
            >
              <KeyRound size={16} strokeWidth={1.75} aria-hidden />
              API &amp; Keys
            </button>
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
              Keyboard Shortcuts
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
                Take Tour
              </button>
            ) : null}
            <div className="ms-menu__separator" aria-hidden />
            <a
              href="https://github.com/PixelMockup/PixelMockup/issues"
              target="_blank"
              rel="noreferrer noopener"
              role="menuitem"
              className="ms-menu__item ms-menu__item--with-icon"
              style={{ textDecoration: 'none', color: 'inherit' }}
              onClick={() => setSettingsOpen(false)}
            >
              <Bug size={16} strokeWidth={1.75} aria-hidden />
              Report a bug
            </a>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
