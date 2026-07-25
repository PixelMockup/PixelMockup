import {
  ARTBOARD_FORMATS,
  RESOLUTION_PRESETS,
  SIZE_SCALE_PRESETS,
  type ArtboardFormatId,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import type { AlignMode } from './artboardSnap';
import type { ExportBgMode } from './exportMockup';

interface StudioToolbarProps {
  hasSelection: boolean;
  /** Any selected device already has a screen image. */
  selectionHasScreenImage: boolean;
  canBringForward: boolean;
  canPushBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
  canvasEmpty: boolean;
  isExporting: boolean;
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportMenuOpen: boolean;
  toolsSheetOpen: boolean;
  moreToolsOpen: boolean;
  sizeScaleId: SizeScaleId;
  artboardFormatId: ArtboardFormatId;
  artboardWidth: number;
  artboardHeight: number;
  snapEnabled: boolean;
  exportBgMode: ExportBgMode;
  exportBgColor: string;
  exportBgImageName: string | null;
  layoutPresets: { id: string; label: string }[];
  forwardTitle: string;
  backTitle: string;
  toFrontTitle: string;
  toBackTitle: string;
  modHint: string;
  duplicateTitle: string;
  deleteTitle: string;
  layerHint: string | null;
  statusMessage: string | null;
  onAlign: (mode: AlignMode) => void;
  onBringForward: () => void;
  onPushBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddScreenImage: () => void;
  onRemoveScreenImage: () => void;
  onSizeScale: (id: SizeScaleId) => void;
  onArtboardFormat: (id: ArtboardFormatId) => void;
  onZoomScreenIn: () => void;
  onZoomScreenOut: () => void;
  onResetScreenFraming: () => void;
  onToggleSnap: () => void;
  onApplyPreset: (id: string) => void;
  onExportFormat: (f: ExportFormat) => void;
  onExportResolution: (r: ExportResolution) => void;
  onExportBgMode: (m: ExportBgMode) => void;
  onExportBgColor: (c: string) => void;
  onExportBgImage: (file: File | null) => void;
  onToggleExportMenu: () => void;
  onDownload: () => void;
  onToggleToolsSheet: () => void;
  onToggleMoreTools: () => void;
  onDismissLayerHint: () => void;
}

function exportPreviewLabel(
  artboardW: number,
  artboardH: number,
  resolution: ExportResolution,
): string {
  if (resolution === 'best') {
    return `Best · artboard ${artboardW}×${artboardH} (scales up to source)`;
  }
  const long = RESOLUTION_PRESETS[resolution];
  const scale = long / Math.max(artboardW, artboardH);
  const w = Math.round(artboardW * scale);
  const h = Math.round(artboardH * scale);
  return `Export ≈ ${w}×${h}px`;
}

export default function StudioToolbar({
  hasSelection,
  canBringForward,
  canPushBackward,
  selectionHasScreenImage,
  canBringToFront,
  canSendToBack,
  canvasEmpty,
  isExporting,
  exportFormat,
  exportResolution,
  exportMenuOpen,
  toolsSheetOpen,
  moreToolsOpen,
  sizeScaleId,
  artboardFormatId,
  artboardWidth,
  artboardHeight,
  snapEnabled,
  exportBgMode,
  exportBgColor,
  exportBgImageName,
  layoutPresets,
  forwardTitle,
  backTitle,
  toFrontTitle,
  toBackTitle,
  modHint,
  duplicateTitle,
  deleteTitle,
  layerHint,
  statusMessage,
  onAlign,
  onBringForward,
  onPushBackward,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
  onSizeScale,
  onArtboardFormat,
  onAddScreenImage,
  onRemoveScreenImage,
  onZoomScreenIn,
  onZoomScreenOut,
  onResetScreenFraming,
  onToggleSnap,
  onApplyPreset,
  onExportFormat,
  onExportResolution,
  onExportBgMode,
  onExportBgColor,
  onExportBgImage,
  onToggleExportMenu,
  onDownload,
  onToggleToolsSheet,
  onToggleMoreTools,
  onDismissLayerHint,
}: StudioToolbarProps) {
  const secondaryTools = (
    <>
      <div
        className="ms-toolbar-group"
        role="group"
        aria-label="Canvas format"
      >
        <span className="ms-toolbar-label">Canvas</span>
        <label className="ms-field ms-field--inline ms-field--toolbar">
          <select
            className="ms-select"
            value={artboardFormatId}
            onChange={(e) =>
              onArtboardFormat(e.target.value as ArtboardFormatId)
            }
            title="Artboard aspect ratio"
            aria-label="Artboard format"
          >
            {ARTBOARD_FORMATS.map((fmt) => (
              <option key={fmt.id} value={fmt.id} title={fmt.hint}>
                {fmt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="ms-toolbar-group"
        role="group"
        aria-label="Device size on artboard"
        title="Device size vs real-world mm scale (quality unchanged)"
      >
        <span className="ms-toolbar-label">Size</span>
        {SIZE_SCALE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="ms-btn"
            aria-pressed={sizeScaleId === preset.id}
            onClick={() => onSizeScale(preset.id)}
            title={`${preset.label} size — Actual = real-world mm scale`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div
        className="ms-toolbar-group"
        role="group"
        aria-label="Snap guides"
      >
        <span className="ms-toolbar-label">Guides</span>
        <button
          type="button"
          className="ms-btn"
          aria-pressed={snapEnabled}
          onClick={onToggleSnap}
          title="Snap to page guides (magenta) and other devices. Haptic feedback when supported by the browser."
          aria-label="Toggle snap to guides"
        >
          Snap
        </button>
      </div>

      <div className="ms-toolbar-group" role="group" aria-label="Align">
        <span className="ms-toolbar-label">Align</span>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('center')}
          disabled={!hasSelection}
          aria-label="Align horizontal center"
          title="Center horizontally on artboard"
        >
          Center
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('middle')}
          disabled={!hasSelection}
          aria-label="Align vertical middle"
          title="Middle vertically on artboard"
        >
          Middle
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('bottom')}
          disabled={!hasSelection}
          aria-label="Align to bottom"
          title="Align to artboard bottom"
        >
          Bottom
        </button>
      </div>

      <div className="ms-toolbar-group" role="group" aria-label="Arrange">
        <span className="ms-toolbar-label">Arrange</span>
      <div className="ms-toolbar-group" role="group" aria-label="Screen image">
        <span className="ms-toolbar-label">Screen</span>
        <button
          type="button"
          className="ms-btn"
          onClick={onAddScreenImage}
          disabled={!hasSelection}
          title={
            hasSelection
              ? 'Show an image on the selected device screens'
              : 'Select a device first'
          }
        >
          {selectionHasScreenImage ? 'Replace image' : 'Add image'}
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onRemoveScreenImage}
          disabled={!selectionHasScreenImage}
          title="Remove screen image from selected devices"
        >
          Remove
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onZoomScreenOut}
          disabled={!selectionHasScreenImage}
          title="Zoom out screen image"
          aria-label="Zoom out screen image"
        >
          −
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onZoomScreenIn}
          disabled={!selectionHasScreenImage}
          title="Zoom in screen image"
          aria-label="Zoom in screen image"
        >
          +
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onResetScreenFraming}
          disabled={!selectionHasScreenImage}
          title="Reset screen image framing"
        >
          Reset
        </button>
      </div>

        <button
          type="button"
          className="ms-btn"
          onClick={onBringForward}
          disabled={!canBringForward}
          title={forwardTitle}
          aria-label="Bring forward"
        >
          Forward
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onPushBackward}
          disabled={!canPushBackward}
          title={backTitle}
          aria-label="Send backward"
        >
          Back
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onBringToFront}
          disabled={!canBringToFront}
          title={toFrontTitle}
          aria-label="Bring to front"
        >
          Front
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onSendToBack}
          disabled={!canSendToBack}
          title={toBackTitle}
          aria-label="Send to back"
        >
          To back
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onDuplicate}
          disabled={!hasSelection}
          title={duplicateTitle}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="ms-btn ms-btn--danger"
          onClick={onDelete}
          disabled={!hasSelection}
          title={deleteTitle}
        >
          Delete
        </button>
      </div>
    </>
  );

  const presetsGroup = (
    <div
      className="ms-toolbar-group"
      role="group"
      aria-label="Layout presets"
    >
      <span className="ms-toolbar-label">Presets</span>
      {layoutPresets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="ms-btn"
          onClick={() => onApplyPreset(preset.id)}
          title={`Apply ${preset.label} layout (replaces artboard)`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );

  const exportBlock = (
    <div className="ms-toolbar-group ms-toolbar-group--export">
      <div className="ms-export-wrap">
        <button
          type="button"
          className="ms-btn ms-btn--primary"
          aria-expanded={exportMenuOpen}
          aria-haspopup="dialog"
          onClick={onToggleExportMenu}
          disabled={canvasEmpty || isExporting}
          title={modHint}
        >
          {isExporting ? 'Exporting…' : 'Export'}
        </button>
        {exportMenuOpen && (
          <div
            className="ms-export-menu"
            role="dialog"
            aria-label="Export options"
          >
            <p className="ms-export-preview">
              {exportPreviewLabel(
                artboardWidth,
                artboardHeight,
                exportResolution,
              )}
            </p>
            <label className="ms-field">
              Format
              <select
                className="ms-select"
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
              Resolution
              <select
                className="ms-select"
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
            <fieldset className="ms-export-bg">
              <legend className="ms-export-bg-legend">Background</legend>
              <div className="ms-export-bg-modes">
                <button
                  type="button"
                  className="ms-btn"
                  aria-pressed={exportBgMode === 'transparent'}
                  onClick={() => onExportBgMode('transparent')}
                  title="Transparent (PNG); JPG uses color"
                >
                  None
                </button>
                <button
                  type="button"
                  className="ms-btn"
                  aria-pressed={exportBgMode === 'color'}
                  onClick={() => onExportBgMode('color')}
                >
                  Color
                </button>
                <button
                  type="button"
                  className="ms-btn"
                  aria-pressed={exportBgMode === 'image'}
                  onClick={() => onExportBgMode('image')}
                >
                  Image
                </button>
              </div>
              {(exportBgMode === 'color' ||
                (exportBgMode === 'transparent' && exportFormat === 'jpg') ||
                exportBgMode === 'image') && (
                <label className="ms-field ms-field--inline">
                  Color
                  <input
                    type="color"
                    className="ms-color"
                    value={exportBgColor}
                    onChange={(e) => onExportBgColor(e.target.value)}
                    aria-label="Export background color"
                  />
                </label>
              )}
              {exportBgMode === 'image' && (
                <div className="ms-export-bg-image">
                  <label className="ms-btn ms-export-file-label">
                    Choose image
                    <input
                      type="file"
                      accept="image/*"
                      className="ms-file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        onExportBgImage(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {exportBgImageName && (
                    <span className="ms-export-bg-file">
                      {exportBgImageName}
                    </span>
                  )}
                  {exportBgImageName && (
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      onClick={() => onExportBgImage(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </fieldset>
            <button
              type="button"
              className="ms-btn ms-btn--primary ms-export-download"
              onClick={onDownload}
              disabled={canvasEmpty || isExporting}
              title={modHint}
            >
              {isExporting ? 'Exporting…' : 'Download'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const primaryDesktop = (
    <>
      {presetsGroup}
      <button
        type="button"
        className="ms-btn"
        aria-expanded={moreToolsOpen}
        onClick={onToggleMoreTools}
      >
        More
      </button>
    </>
  );

  return (
    <>
      <div className="ms-toolbar ms-toolbar--desktop">
        {primaryDesktop}
        {moreToolsOpen && (
          <div className="ms-toolbar-more" role="region" aria-label="More tools">
            {secondaryTools}
          </div>
        )}
        <div className="ms-toolbar-spacer" />
        {exportBlock}
      </div>

      <div className="ms-toolbar ms-toolbar--mobile">
        <button
          type="button"
          className="ms-btn"
          aria-expanded={toolsSheetOpen}
          onClick={onToggleToolsSheet}
        >
          Tools
        </button>
        <div className="ms-toolbar-spacer" />
        {exportBlock}
      </div>

      {toolsSheetOpen && (
        <div className="ms-tools-sheet" role="dialog" aria-label="Canvas tools">
          <div className="ms-tools-sheet-header">
            <span>Tools</span>
            <button
              type="button"
              className="ms-btn ms-btn--ghost"
              onClick={onToggleToolsSheet}
              aria-label="Close tools"
            >
              Close
            </button>
          </div>
          <div className="ms-tools-sheet-body">
            {presetsGroup}
            {secondaryTools}
          </div>
        </div>
      )}

      {layerHint && (
        <div className="ms-hint-bar" role="status">
          <span>{layerHint}</span>
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={onDismissLayerHint}
          >
            Dismiss
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="ms-toast" role="status">
          {statusMessage}
        </div>
      )}

      <div className="ms-a11y-live" aria-live="polite">
        {statusMessage}
      </div>
    </>
  );
}
