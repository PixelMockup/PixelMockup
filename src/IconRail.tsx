import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Keyboard,
  LayoutTemplate,
  Magnet,
  Moon,
  Smartphone,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { LAYOUT_PRESETS } from './layoutPresets';
import {
  ARTBOARD_FORMATS,
  SIZE_SCALE_PRESETS,
  type ArtboardFormatId,
  type SizeScaleId,
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
  onOpenShortcuts: () => void;
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
  onOpenShortcuts,
  layoutsRef,
  moreRef,
}: Props) {
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
          onLayoutsOpenChange(false);
          onMoreOpenChange(false);
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
            if (devicesOpen) onToggleDevices();
          }}
        >
          <LayoutTemplate size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {layoutsOpen ? (
          <div className="ms-menu ms-rail-menu" role="menu">
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
          aria-label="Canvas tools"
          title="Canvas tools"
          onClick={() => {
            onMoreOpenChange(!moreOpen);
            onLayoutsOpenChange(false);
            if (devicesOpen) onToggleDevices();
          }}
        >
          <SlidersHorizontal size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {moreOpen ? (
          <div className="ms-menu ms-rail-menu ms-rail-menu--wide" role="menu">
            <label className="ms-field">
              <span className="ms-field__label">Canvas size</span>
              <select
                value={artboardFormatId}
                onChange={(e) =>
                  onArtboardFormat(e.target.value as ArtboardFormatId)
                }
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
                onChange={(e) => onSizeScale(e.target.value as SizeScaleId)}
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
          </div>
        ) : null}
      </div>

      <div className="ms-icon-rail__spacer" />

      <button
        type="button"
        className="ms-rail-btn"
        aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <Sun size={20} strokeWidth={1.5} aria-hidden />
        ) : (
          <Moon size={20} strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="ms-rail-btn"
        aria-label="Shortcuts"
        title="Shortcuts"
        onClick={onOpenShortcuts}
      >
        <Keyboard size={20} strokeWidth={1.5} aria-hidden />
      </button>
    </nav>
  );
}
