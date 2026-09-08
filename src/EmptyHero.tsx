import { useId, useState, type SubmitEvent } from 'react';
import { normalizeWebsiteUrl } from './websiteUrl';

type Props = {
  onShowOnDevices: (url: string) => void;
  busy?: boolean;
};

/**
 * Empty-stage hero: paste URL → show on Apple lineup devices.
 */
export default function EmptyHero({
  onShowOnDevices,
  busy = false,
}: Readonly<Props>) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const normalized = normalizeWebsiteUrl(draft);
    if (!normalized) {
      setError('Enter a website (e.g. google.com)');
      return;
    }
    setError(null);
    setDraft(normalized);
    onShowOnDevices(normalized);
  };

  return (
    <div className="ms-empty-hero" aria-live="polite">
      <p className="ms-empty-hero__brand">Pixel Mockup</p>
      <p className="ms-empty-hero__title">Show your website on real devices.</p>
      <form className="ms-empty-hero__form" onSubmit={submit}>
        <label className="ms-sr-only" htmlFor={inputId}>
          Website URL
        </label>
        <input
          id={inputId}
          className="ms-empty-hero__input"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="google.com"
          value={draft}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error != null}
          aria-describedby={error ? `${inputId}-err` : undefined}
        />
        <button
          type="submit"
          className="ms-btn ms-btn--accent ms-empty-hero__cta"
          disabled={busy || !draft.trim()}
        >
          Show on devices
        </button>
      </form>
      {error ? (
        <p id={`${inputId}-err`} className="ms-empty-hero__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
