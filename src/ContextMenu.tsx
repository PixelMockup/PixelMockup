import type { AlignMode } from './artboardSnap';
import type { PlatformId } from './keybindings';
import { formatChordForDisplay } from './keybindings';

export type ContextMenuTarget = 'device' | 'artboard';

export type ContextMenuState = {
  x: number;
  y: number;
  target: ContextMenuTarget;
};

interface ContextMenuProps {
  state: ContextMenuState;
  platform: PlatformId;
  hasSelection: boolean;
  /** Any selected device already has a screen image. */
  hasScreenImage: boolean;
  canPaste: boolean;
  canBringForward: boolean;
  canPushBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
  onSelectAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onPushBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onAlign: (mode: AlignMode) => void;
  onAddScreenImage: () => void;
  onRemoveScreenImage: () => void;
  onResetScreenFraming: () => void;
  onClose: () => void;
}

function Item({
  label,
  hint,
  disabled,
  onClick,
}: Readonly<{
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      role="menuitem"
      className="ms-ctx-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      {hint ? <span className="ms-ctx-hint" > {hint}</span> : null}
    </button >
  );
}

function Sep() {
  return <hr><div className="ms-ctx-sep" /></hr>;
}

export default function ContextMenu({
  state,
  platform,
  hasSelection,
  hasScreenImage,
  canPaste,
  canBringForward,
  canPushBackward,
  canBringToFront,
  canSendToBack,
  onSelectAll,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onBringForward,
  onPushBackward,
  onBringToFront,
  onSendToBack,
  onAlign,
  onAddScreenImage,
  onRemoveScreenImage,
  onResetScreenFraming,
  onClose,
}: Readonly<ContextMenuProps>) {
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const device = state.target === 'device';

  return (
    <div
      className="ms-ctx"
      role="menu"
      tabIndex={-1}
      style={{ left: state.x, top: state.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item
        label="Select all"
        hint={formatChordForDisplay('mod+a', platform)}
        onClick={run(onSelectAll)}
      />
      {device ? (
        <>
          <Item
            label="Copy"
            hint={formatChordForDisplay('mod+c', platform)}
            disabled={!hasSelection}
            onClick={run(onCopy)}
          />
          <Item
            label="Paste"
            hint={formatChordForDisplay('mod+v', platform)}
            disabled={!canPaste}
            onClick={run(onPaste)}
          />
          <Item
            label="Duplicate"
            hint={formatChordForDisplay('mod+d', platform)}
            disabled={!hasSelection}
            onClick={run(onDuplicate)}
          />
          <Item
            label="Delete"
            hint={`${formatChordForDisplay('delete', platform)} / ${formatChordForDisplay('backspace', platform)}`}
            disabled={!hasSelection}
            onClick={run(onDelete)}
          />
          <Sep />
          <Item
            label={hasScreenImage ? 'Replace screen image…' : 'Add screen image…'}
            disabled={!hasSelection}
            onClick={run(onAddScreenImage)}
          />
          <Item
            label="Remove screen image"
            disabled={!hasScreenImage}
            onClick={run(onRemoveScreenImage)}
          />
          <Item
            label="Reset screen framing"
            disabled={!hasScreenImage}
            onClick={run(onResetScreenFraming)}
          />
          <Sep />
          <Item
            label="Bring forward"
            hint={formatChordForDisplay(']', platform)}
            disabled={!canBringForward}
            onClick={run(onBringForward)}
          />
          <Item
            label="Send backward"
            hint={formatChordForDisplay('[', platform)}
            disabled={!canPushBackward}
            onClick={run(onPushBackward)}
          />
          <Item
            label="Bring to front"
            hint={formatChordForDisplay('mod+]', platform)}
            disabled={!canBringToFront}
            onClick={run(onBringToFront)}
          />
          <Item
            label="Send to back"
            hint={formatChordForDisplay('mod+[', platform)}
            disabled={!canSendToBack}
            onClick={run(onSendToBack)}
          />
          <Sep />
          <div className="ms-ctx-label">Align</div>
          <Item label="Center" disabled={!hasSelection} onClick={run(() => onAlign('center'))} />
          <Item label="Middle" disabled={!hasSelection} onClick={run(() => onAlign('middle'))} />
          <Item label="Bottom" disabled={!hasSelection} onClick={run(() => onAlign('bottom'))} />
        </>
      ) : (
        <Item
          label="Paste"
          hint={formatChordForDisplay('mod+v', platform)}
          disabled={!canPaste}
          onClick={run(onPaste)}
        />
      )}
    </div>
  );
}
