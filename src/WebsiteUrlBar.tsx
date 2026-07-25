import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
  websiteHostname,
} from './websiteUrl';

export interface WebsiteUrlBarProps {
  websiteUrl: string | null;
  onApply: (url: string) => void;
  onClear: () => void;
}

export default function WebsiteUrlBar({
  websiteUrl,
  onApply,
  onClear,
}: WebsiteUrlBarProps) {
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
    onApply(normalized);
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
    <form
      className="ms-website-bar"
      onSubmit={handleSubmit}
      aria-label="Website on devices"
    >
      <label className="ms-website-bar__label" htmlFor={inputId}>
        Website
      </label>
      <input
        id={inputId}
        className="ms-website-bar__input"
        type="text"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder="https://example.com"
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
        className="ms-btn"
        disabled={!canApply}
        title="Show this website on all canvas devices"
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
          onClear();
        }}
        title="Clear website from devices"
      >
        Clear
      </button>
      {websiteUrl ? (
        <span className="ms-website-bar__active" title={websiteUrl}>
          On devices: {websiteHostname(websiteUrl)}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="ms-website-bar__error" role="alert">
          {error}
        </span>
      ) : websiteUrl ? (
        <span className="ms-website-bar__hint">
          Rendered as a screenshot (needs the app running via npm run dev);
          Add image still overrides per device.
        </span>
      ) : null}
    </form>
  );
}
