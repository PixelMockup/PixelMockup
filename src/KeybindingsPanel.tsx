import { useEffect, useState, useRef } from 'react';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  assignChord,
  detectPlatform,
  eventToChord,
  formatBindingsForDisplay,
  formatChordForDisplay,
  platformDisplayName,
  resetBindingsForPlatform,
  saveBindingsForPlatform,
  type BindingMap,
  type KeyActionId,
  type PlatformId,
} from './keybindings';
import { RotateCcw, SquarePen, X } from 'lucide-react';

interface KeybindingsPanelProps {
  open: boolean;
  onClose: () => void;
  bindings: BindingMap;
  onBindingsChange: (next: BindingMap) => void;
  platform?: PlatformId;
}

export default function KeybindingsPanel({
  open,
  onClose,
  bindings,
  onBindingsChange,
  platform = detectPlatform(),
}: Readonly<KeybindingsPanelProps>) {
  const [listeningAction, setListeningAction] = useState<KeyActionId | null>(
    null,
  );
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) {
      setListeningAction(null);
      setConflictWarning(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !listeningAction) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListeningAction(null);
        return;
      }

      if (
        e.key === 'Shift' ||
        e.key === 'Control' ||
        e.key === 'Meta' ||
        e.key === 'Alt'
      ) {
        return;
      }

      const chord = eventToChord(e, platform);
      if (!chord || chord === 'mod' || chord === 'shift' || chord === 'alt') {
        return;
      }

      const conflictId = ACTION_ORDER.find(
        (id) => id !== listeningAction && (bindings[id] ?? []).includes(chord),
      );
      if (conflictId) {
        setConflictWarning(ACTION_LABELS[conflictId]);
        setListeningAction(null);
        return;
      }

      const next = assignChord(bindings, listeningAction, chord);
      onBindingsChange(next);
      saveBindingsForPlatform(platform, next);
      setConflictWarning(null);
      setListeningAction(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, listeningAction, bindings, onBindingsChange, platform]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  const handleReset = () => {
    const defaults = resetBindingsForPlatform(platform);
    onBindingsChange(defaults);
    setListeningAction(null);
  };

  return (
    <dialog
      ref={dialogRef}
      className="ms-modal-backdrop"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      onClose={onClose} // fires for escape
    >
      <div className="ms-modal">
        <div className="ms-modal-header">
          <div style={{ flex: 1 }}>
            <h2>Keyboard Shortcuts</h2>
            <p className="ms-modal-sub">
              Shortcuts for {platformDisplayName(platform)}. Remaps apply only
              on this OS.
            </p>
          </div>
          <button type="button" className="ms-icon-btn" onClick={handleReset}>
            <RotateCcw size={20} strokeWidth={1.5} />
          </button>
          <button type="button" className="ms-btn ms-btn--ghost" onClick={onClose}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="ms-modal-body">
          {conflictWarning ? (
            <p className="ms-listen-hint" style={{ color: '#c00', fontWeight: 600 }}>
              Already bound to <strong>{conflictWarning}</strong> — choose a different shortcut.
            </p>
          ) : null}


          <table className="ms-keys-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Keys</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ACTION_ORDER.map((id) => (
                <tr key={id}>
                  <td>{ACTION_LABELS[id]}</td>
                  <td>
                    <code>
                      {listeningAction === id
                        ? '…'
                        : formatBindingsForDisplay(bindings[id] ?? [], platform) ||
                        '—'}
                    </code>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="ms-icon-btn"
                      onClick={() => {
                        if (listeningAction === id) {
                          setListeningAction(null);
                          setConflictWarning(null);
                        } else {
                          setConflictWarning(null);
                          setListeningAction(id);
                        }
                      }}
                      disabled={
                        listeningAction !== null && listeningAction !== id
                      }
                    >
                      {listeningAction === id ? <X size={20} strokeWidth={1.5} /> : <SquarePen size={20} strokeWidth={1.5} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="ms-modal-foot">
            Defaults use Mod = {isMacHint(platform)}. Example:{' '}
            {formatChordForDisplay('mod+shift+s', platform)}.
          </p>
        </div>
      </div>
    </dialog>
  );
}

function isMacHint(platform: PlatformId): string {
  return platform === 'mac' ? '⌘ (Command)' : 'Ctrl';
}
