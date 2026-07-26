import {
  BringToFront,
  Copy,
  ImagePlus,
  SendToBack,
  Trash2,
} from 'lucide-react';

type Props = {
  open: boolean;
  canEditPhoto: boolean;
  photoZoom: number;
  onPhotoZoom: (v: number) => void;
  onResetPhotoFraming: () => void;
  onUploadPhoto: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  canReorder: boolean;
};

export default function SelectionInspector({
  open,
  canEditPhoto,
  photoZoom,
  onPhotoZoom,
  onResetPhotoFraming,
  onUploadPhoto,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  canReorder,
}: Props) {
  if (!open) return null;

  return (
    <aside className="ms-selection-inspector" aria-label="Selection">
      <button
        type="button"
        className="ms-icon-btn"
        aria-label="Upload photo"
        title="Upload photo"
        onClick={onUploadPhoto}
      >
        <ImagePlus size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {canEditPhoto ? (
        <>
          <label className="ms-selection-inspector__zoom">
            <span className="ms-sr-only">Photo zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={photoZoom}
              onChange={(e) => onPhotoZoom(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="ms-btn ms-btn--ghost ms-btn--compact"
            onClick={onResetPhotoFraming}
          >
            Reset
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="ms-icon-btn"
        aria-label="Duplicate"
        title="Duplicate"
        onClick={onDuplicate}
      >
        <Copy size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="ms-icon-btn"
        aria-label="Bring forward"
        title="Bring forward"
        disabled={!canReorder}
        onClick={onBringForward}
      >
        <BringToFront size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="ms-icon-btn"
        aria-label="Send backward"
        title="Send backward"
        disabled={!canReorder}
        onClick={onSendBackward}
      >
        <SendToBack size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="ms-icon-btn ms-icon-btn--danger"
        aria-label="Delete"
        title="Delete"
        onClick={onDelete}
      >
        <Trash2 size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </aside>
  );
}
