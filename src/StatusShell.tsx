import type { RefObject } from 'react';

type StatusShellProps = {
  screenFileInputRef: RefObject<HTMLInputElement | null>;
  applyScreenImageFile: (file: File) => Promise<void>;
  layerHint: string | null;
  setLayerHint: (hint: string | null) => void;
  statusMessage: string | null;
  statusTone?: 'info' | 'error';
};

export default function StatusShell({
  screenFileInputRef,
  applyScreenImageFile,
  layerHint,
  setLayerHint,
  statusMessage,
  statusTone = 'info',
}: StatusShellProps) {
  return (
    <>
      <input
        ref={screenFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="ms-screen-file-input"
        aria-label="Choose a screen image for selected devices"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (file) void applyScreenImageFile(file);
        }}
      />

      {layerHint ? (
        <output className="ms-hint-bar">
          <span>{layerHint}</span>
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={() => setLayerHint(null)}
          >
            Dismiss
          </button>
        </output>
      ) : null}

      {statusMessage ? (
        <output
          className={[
            'ms-toast',
            statusTone === 'error' ? 'ms-toast--error' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {statusMessage}
        </output>
      ) : null}

      <div className="ms-a11y-live" aria-live="polite">
        {statusMessage}
      </div>
    </>
  );
}
