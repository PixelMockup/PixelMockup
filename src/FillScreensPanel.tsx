import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
  websiteHostname,
} from './websiteUrl';

export interface FillScreensPanelProps {
  websiteUrl: string | null;
  capturingHint?: string | null;
  onApplyUrl: (url: string) => void;
  onClearUrl: () => void;
  onUploadImage: () => void;
}

/**
 * Step 2 panel: website URL + photo upload.
 * Only mounted when the canvas has devices.
 */
export default function FillScreensPanel({
  websiteUrl,
  capturingHint,
  onApplyUrl,
  onClearUrl,
  onUploadImage,
}: FillScreensPanelProps) {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tryApply = () => {
    const normalized = normalizeWebsiteUrl(draft);
    if (!normalized) {
      setError('Enter a valid http(s) URL');
      return;
    }
    setError(null);
    setDraft(normalized);
    onApplyUrl(normalized);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    tryApply();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryApply();
    }
  };

  const canApply = draft.trim().length > 0 && isValidWebsiteUrl(draft);

  return (
    <section className="ms-fill-panel" aria-label="Fill screens">
      <div className="ms-fill-panel__head">
        <h2 className="ms-fill-panel__title">Fill screens</h2>
        <p className="ms-fill-panel__help">
          Screens update on every device. Upload a photo to override the site on
          selected devices.
        </p>
      </div>
      <form className="ms-fill-panel__row" onSubmit={handleSubmit}>
        <label className="ms-fill-panel__label" htmlFor={inputId}>
          Website
        </label>
        <input
          id={inputId}
          className="ms-fill-panel__input"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://your-site.com"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={error != null}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="submit"
          className="ms-btn ms-btn--primary"
          disabled={!canApply}
          title="Show this website on all devices"
        >
          Apply
        </button>
        <button
          type="button"
          className="ms-btn"
          disabled={!websiteUrl}
          onClick={() => {
            setDraft('');
            setError(null);
            onClearUrl();
          }}
          title="Clear website from devices"
        >
          Clear
        </button>
        <button
          type="button"
          className="ms-btn"
          onClick={onUploadImage}
          title="Upload a photo onto selected devices (or all without a photo)"
        >
          Upload photo
        </button>
      </form>
      {error ? (
        <p id={errorId} className="ms-fill-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {capturingHint ? (
        <p className="ms-fill-panel__status" role="status">
          {capturingHint}
        </p>
      ) : websiteUrl ? (
        <p className="ms-fill-panel__status" title={websiteUrl}>
          Showing {websiteHostname(websiteUrl)} · needs the app via npm run
          dev for live capture
        </p>
      ) : null}
    </section>
  );
}
