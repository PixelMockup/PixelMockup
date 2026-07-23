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

      // Ignore bare modifier presses
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
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          width: 'min(560px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Keyboard shortcuts</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              Shortcuts for {platformDisplayName(platform)}. Remaps apply only
              on this OS.
            </p>
          </div>
          <button type="button" onClick={handleReset}>
            Reset to defaults
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 12px 16px' }}>
          {listeningAction && (
            <p
              style={{
                margin: '8px 8px 12px',
                padding: '10px 12px',
                backgroundColor: '#e7f1ff',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              Press a new key combination for{' '}
              <strong>{ACTION_LABELS[listeningAction]}</strong>… (Esc to cancel)
            </p>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#666' }}>
                <th style={{ padding: '8px', fontWeight: 500 }}>Action</th>
                <th style={{ padding: '8px', fontWeight: 500 }}>Keys</th>
                <th style={{ padding: '8px', fontWeight: 500 }} />
              </tr>
            </thead>
            <tbody>
              {ACTION_ORDER.map((id) => (
                <tr key={id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '10px 8px' }}>{ACTION_LABELS[id]}</td>
                  <td style={{ padding: '10px 8px', fontFamily: 'ui-monospace, monospace' }}>
                    {listeningAction === id
                      ? '…'
                      : formatBindingsForDisplay(bindings[id] ?? [], platform) ||
                        '—'}
                  </td>
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => setListeningAction(id)}
                      disabled={listeningAction !== null && listeningAction !== id}
                    >
                      Rebind
                    </button>{' '}
                    <button
                      type="button"
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

          <p style={{ margin: '12px 8px 0', fontSize: 12, color: '#888' }}>
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
