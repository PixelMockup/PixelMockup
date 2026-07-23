import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  assignChord,
  clearChords,
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
}: KeybindingsPanelProps) {
  const [listeningAction, setListeningAction] = useState<KeyActionId | null>(
    null,
  );

  useEffect(() => {
    if (!open) setListeningAction(null);
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

      const next = assignChord(bindings, listeningAction, chord);
      onBindingsChange(next);
      saveBindingsForPlatform(platform, next);
      setListeningAction(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, listeningAction, bindings, onBindingsChange, platform]);

  if (!open) return null;

  const handleReset = () => {
    const defaults = resetBindingsForPlatform(platform);
    onBindingsChange(defaults);
    setListeningAction(null);
  };

  const handleClear = (id: KeyActionId) => {
    const next = clearChords(bindings, id);
    onBindingsChange(next);
    saveBindingsForPlatform(platform, next);
  };

  return (
    <div
      className="ms-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ms-modal">
        <div className="ms-modal-header">
          <div style={{ flex: 1 }}>
            <h2>Keyboard shortcuts</h2>
            <p className="ms-modal-sub">
              Shortcuts for {platformDisplayName(platform)}. Remaps apply only
              on this OS.
            </p>
          </div>
          <button type="button" className="ms-btn" onClick={handleReset}>
            Reset
          </button>
          <button type="button" className="ms-btn ms-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ms-modal-body">
          {listeningAction && (
            <p className="ms-listen-hint">
              Press a new key combination for{' '}
              <strong>{ACTION_LABELS[listeningAction]}</strong>… (Esc to cancel)
            </p>
          )}

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
                      className="ms-btn"
                      onClick={() => setListeningAction(id)}
                      disabled={
                        listeningAction !== null && listeningAction !== id
                      }
                    >
                      Rebind
                    </button>{' '}
                    <button
                      type="button"
                      className="ms-btn ms-btn--ghost"
                      onClick={() => handleClear(id)}
                      disabled={(bindings[id] ?? []).length === 0}
                    >
                      Clear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="ms-modal-foot">
            Defaults use Mod = {isMacHint(platform)}. Example:{' '}
            {formatChordForDisplay('mod+s', platform)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function isMacHint(platform: PlatformId): string {
  return platform === 'mac' ? '⌘ (Command)' : 'Ctrl';
}
