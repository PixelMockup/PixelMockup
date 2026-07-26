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
  selectionHasScreenImage: boolean;
  canBringForward: boolean;
  canPushBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
  canvasEmpty: boolean;
  screensFilled: boolean;
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
  onStartAppleLineup: () => void;
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
  onOpenDevices: () => void;
}

function downloadPreviewLabel(
  artboardW: number,
  artboardH: number,
  resolution: ExportResolution,
): string {
  if (resolution === 'best') {
    return `Best · canvas ${artboardW}×${artboardH}`;
  }
  const long = RESOLUTION_PRESETS[resolution];
  const scale = long / Math.max(artboardW, artboardH);
  const w = Math.round(artboardW * scale);
  const h = Math.round(artboardH * scale);
  return `≈ ${w}×${h}px`;
}

export default function StudioToolbar({
  hasSelection,
  canBringForward,
  canPushBackward,
  selectionHasScreenImage,
  canBringToFront,
  canSendToBack,
  canvasEmpty,
  screensFilled,
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
  onStartAppleLineup,
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
  onOpenDevices,
}: StudioToolbarProps) {
  const showPower = !canvasEmpty;

  const editCluster = hasSelection ? (
    <div className="ms-toolbar-group" role="group" aria-label="Edit selection">
      <span className="ms-toolbar-label">Edit</span>
      <button
        type="button"
        className="ms-btn"
        onClick={onAddScreenImage}
        title="Upload a photo onto selected devices"
      >
        {selectionHasScreenImage ? 'Replace photo' : 'Upload photo'}
      </button>
      {selectionHasScreenImage ? (
        <>
          <button
            type="button"
            className="ms-btn"
            onClick={onRemoveScreenImage}
            title="Remove photo from selected devices"
          >
            Remove photo
          </button>
          <button
            type="button"
            className="ms-btn"
            onClick={onZoomScreenOut}
            title="Zoom out photo"
            aria-label="Zoom out photo"
          >
            −
          </button>
          <button
            type="button"
            className="ms-btn"
            onClick={onZoomScreenIn}
            title="Zoom in photo"
            aria-label="Zoom in photo"
          >
            +
          </button>
          <button
            type="button"
            className="ms-btn"
            onClick={onResetScreenFraming}
            title="Reset photo framing"
          >
            Reset
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="ms-btn"
        onClick={onDuplicate}
        title={duplicateTitle}
      >
        Duplicate
      </button>
      <button
        type="button"
        className="ms-btn ms-btn--danger"
        onClick={onDelete}
        title={deleteTitle}
      >
        Delete
      </button>
    </div>
  ) : null;

  const moreToolsBody = (
    <>
      <div className="ms-toolbar-group" role="group" aria-label="Canvas format">
        <span className="ms-toolbar-label">Canvas</span>
        <label className="ms-field ms-field--inline ms-field--toolbar">
          <select
            className="ms-select"
            value={artboardFormatId}
            onChange={(e) =>
              onArtboardFormat(e.target.value as ArtboardFormatId)
            }
            title="Canvas aspect ratio"
            aria-label="Canvas format"
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
        aria-label="Device size"
        title="Device size vs real-world mm scale"
      >
        <span className="ms-toolbar-label">Size</span>
        {SIZE_SCALE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="ms-btn"
            aria-pressed={sizeScaleId === preset.id}
            onClick={() => onSizeScale(preset.id)}
            title={`${preset.label} size`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="ms-toolbar-group" role="group" aria-label="Snap to edges">
        <span className="ms-toolbar-label">Snap</span>
        <button
          type="button"
          className="ms-btn"
          aria-pressed={snapEnabled}
          onClick={onToggleSnap}
          title="Snap to edges and other devices"
          aria-label="Toggle snap to edges"
        >
          {snapEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="ms-toolbar-group" role="group" aria-label="Align">
        <span className="ms-toolbar-label">Align</span>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('center')}
          disabled={!hasSelection}
          title="Center horizontally"
        >
          Center
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('middle')}
          disabled={!hasSelection}
          title="Middle vertically"
        >
          Middle
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('bottom')}
          disabled={!hasSelection}
          title="Align to bottom"
        >
          Bottom
        </button>
      </div>

      <div className="ms-toolbar-group" role="group" aria-label="Layer order">
        <span className="ms-toolbar-label">Layers</span>
        <button
          type="button"
          className="ms-btn"
          onClick={onBringForward}
          disabled={!canBringForward}
          title={forwardTitle}
        >
          Forward
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onPushBackward}
          disabled={!canPushBackward}
          title={backTitle}
        >
          Back
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onBringToFront}
          disabled={!canBringToFront}
          title={toFrontTitle}
        >
          Front
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onSendToBack}
          disabled={!canSendToBack}
          title={toBackTitle}
        >
          To back
        </button>
      </div>
    </>
  );

  const layoutsMenu = showPower ? (
    <div className="ms-toolbar-group" role="group" aria-label="Layouts">
      <span className="ms-toolbar-label">Layouts</span>
      <label className="ms-field ms-field--inline ms-field--toolbar">
        <select
          className="ms-select"
          defaultValue=""
          aria-label="Apply a layout"
          onChange={(e) => {
            const id = e.target.value;
            if (id) onApplyPreset(id);
            e.target.value = '';
          }}
        >
          <option value="" disabled>
            Choose layout…
          </option>
          {layoutPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  ) : null;

  const downloadBlock = (
    <div className="ms-toolbar-group ms-toolbar-group--export">
      <div className="ms-export-wrap">
        <button
          type="button"
          className={[
            'ms-btn',
            'ms-btn--primary',
            screensFilled && !canvasEmpty ? 'ms-btn--download-ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onDownload}
          disabled={canvasEmpty || isExporting}
          title={modHint}
        >
          {isExporting ? 'Downloading…' : 'Download'}
        </button>
        <button
          type="button"
          className="ms-btn ms-btn--ghost ms-download-options"
          aria-expanded={exportMenuOpen}
          aria-haspopup="dialog"
          onClick={onToggleExportMenu}
          disabled={canvasEmpty || isExporting}
          title="Download options"
          aria-label="Download options"
        >
          ⋯
        </button>
        {exportMenuOpen && (
          <div
            className="ms-export-menu"
            role="dialog"
            aria-label="Download options"
          >
            <p className="ms-export-preview">
              {downloadPreviewLabel(
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
                    aria-label="Download background color"
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
                    <span className="ms-export-bg-file">{exportBgImageName}</span>
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
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="ms-toolbar ms-toolbar--desktop">
        {canvasEmpty ? (
          <button
            type="button"
            className="ms-btn"
            onClick={onOpenDevices}
            title="Browse devices"
          >
            Devices
          </button>
        ) : (
          <>
            {layoutsMenu}
            {editCluster}
            <button
              type="button"
              className="ms-btn"
              aria-expanded={moreToolsOpen}
              onClick={onToggleMoreTools}
            >
              More tools
            </button>
          </>
        )}
        {moreToolsOpen && showPower && (
          <div className="ms-toolbar-more" role="region" aria-label="More tools">
            {moreToolsBody}
          </div>
        )}
        <div className="ms-toolbar-spacer" />
        {downloadBlock}
      </div>

      <div className="ms-toolbar ms-toolbar--mobile">
        <button type="button" className="ms-btn" onClick={onOpenDevices}>
          Devices
        </button>
        {canvasEmpty ? (
          <button
            type="button"
            className="ms-btn ms-btn--primary"
            onClick={onStartAppleLineup}
          >
            Start layout
          </button>
        ) : (
          <button
            type="button"
            className="ms-btn"
            aria-expanded={toolsSheetOpen}
            onClick={onToggleToolsSheet}
          >
            Tools
          </button>
        )}
        <div className="ms-toolbar-spacer" />
        {downloadBlock}
      </div>

      {toolsSheetOpen && showPower && (
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
            {layoutsMenu}
            {editCluster}
            {moreToolsBody}
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
