import {
  SIZE_SCALE_PRESETS,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import type { AlignMode } from './artboardSnap';

interface StudioToolbarProps {
  selectedId: string | null;
  canBringForward: boolean;
  canPushBackward: boolean;
  canvasEmpty: boolean;
  isExporting: boolean;
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
  exportMenuOpen: boolean;
  toolsSheetOpen: boolean;
  sizeScaleId: SizeScaleId;
  forwardTitle: string;
  backTitle: string;
  modHint: string;
  duplicateTitle: string;
  deleteTitle: string;
  layerHint: string | null;
  statusMessage: string | null;
  onAlign: (mode: AlignMode) => void;
  onBringForward: () => void;
  onPushBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSizeScale: (id: SizeScaleId) => void;
  onExportFormat: (f: ExportFormat) => void;
  onExportResolution: (r: ExportResolution) => void;
  onToggleExportMenu: () => void;
  onDownload: () => void;
  onToggleToolsSheet: () => void;
  onDismissLayerHint: () => void;
}

export default function StudioToolbar({
  selectedId,
  canBringForward,
  canPushBackward,
  canvasEmpty,
  isExporting,
  exportFormat,
  exportResolution,
  exportMenuOpen,
  toolsSheetOpen,
  sizeScaleId,
  forwardTitle,
  backTitle,
  modHint,
  duplicateTitle,
  deleteTitle,
  layerHint,
  statusMessage,
  onAlign,
  onBringForward,
  onPushBackward,
  onDuplicate,
  onDelete,
  onSizeScale,
  onExportFormat,
  onExportResolution,
  onToggleExportMenu,
  onDownload,
  onToggleToolsSheet,
  onDismissLayerHint,
}: StudioToolbarProps) {
  const sizeGroup = (
    <div
      className="ms-toolbar-group"
      role="group"
      aria-label="Device size on artboard"
      title="Device size on artboard (quality unchanged)"
    >
      <span className="ms-toolbar-label">Size</span>
      {SIZE_SCALE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="ms-btn"
          aria-pressed={sizeScaleId === preset.id}
          onClick={() => onSizeScale(preset.id)}
          title={`Device size ${preset.label} (quality unchanged)`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );

  const alignArrange = (
    <>
      {sizeGroup}

      <div className="ms-toolbar-group">
        <span className="ms-toolbar-label">Align</span>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('center')}
          disabled={!selectedId}
          aria-label="Align horizontal center"
          title="Center horizontally on artboard"
        >
          Center
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('middle')}
          disabled={!selectedId}
          aria-label="Align vertical middle"
          title="Middle vertically on artboard"
        >
          Middle
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={() => onAlign('bottom')}
          disabled={!selectedId}
          aria-label="Align to bottom"
          title="Align to artboard bottom"
        >
          Bottom
        </button>
      </div>

      <div className="ms-toolbar-group">
        <span className="ms-toolbar-label">Arrange</span>
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
          onClick={onDuplicate}
          disabled={!selectedId}
          title={duplicateTitle}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="ms-btn ms-btn--danger"
          onClick={onDelete}
          disabled={!selectedId}
          title={deleteTitle}
        >
          Delete
        </button>
      </div>
    </>
  );

  const exportBlock = (
    <div className="ms-toolbar-group ms-toolbar-group--export">
      <div className="ms-export-wrap">
        <button
          type="button"
          className="ms-btn"
          aria-expanded={exportMenuOpen}
          aria-haspopup="dialog"
          onClick={onToggleExportMenu}
        >
          Export
        </button>
        {exportMenuOpen && (
          <div className="ms-export-menu" role="dialog" aria-label="Export options">
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
          </div>
        )}
      </div>
      <button
        type="button"
        className="ms-btn ms-btn--primary"
        onClick={onDownload}
        disabled={canvasEmpty || isExporting}
        title={modHint}
      >
        {isExporting ? 'Exporting…' : 'Download'}
      </button>
    </div>
  );

  return (
    <>
      <div className="ms-toolbar ms-toolbar--desktop">
        {alignArrange}
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
          <div className="ms-tools-sheet-body">{alignArrange}</div>
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

      <div className="ms-a11y-live" aria-live="polite">
        {statusMessage}
      </div>
    </>
  );
}
