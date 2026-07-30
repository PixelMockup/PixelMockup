import { useEffect, useMemo, useState } from 'react';
import './ProgressLoader.css';

type ProgressLoaderProps = {
  /** 0–100 loading percentage. */
  progress: number;
  /** Status messages to cycle through above the bar. */
  messages: string[];
  /** Time in ms each message is visible before scrolling to the next. */
  intervalMs?: number;
  /** Optional accessible label for the progress bar. */
  label?: string;
  /**
   * When set, show this as the visible scrolling line and animate on change
   * (disables the multi-message timer ticker).
   */
  activeMessage?: string;
};

export default function ProgressLoader({
  progress,
  messages,
  intervalMs = 1800,
  label = 'Loading…',
  activeMessage,
}: Readonly<ProgressLoaderProps>) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<string[]>(() => {
    const trimmed = activeMessage?.trim() ?? '';
    return trimmed !== '' ? [trimmed] : [];
  });
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const isDriven = activeMessage !== undefined;

  const uniqueMessages = useMemo(
    () => messages.filter((m) => m.trim() !== ''),
    [messages],
  );

  useEffect(() => {
    if (activeMessage === undefined) return;
    const trimmed = activeMessage.trim();
    if (trimmed === '') return;
    setHistory((prev) => {
      if (prev[prev.length - 1] === trimmed) return prev;
      return [...prev, trimmed];
    });
  }, [activeMessage]);

  useEffect(() => {
    if (activeMessage !== undefined) return;
    if (uniqueMessages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % uniqueMessages.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [uniqueMessages, intervalMs, activeMessage]);

  const displayMessages = isDriven ? history : uniqueMessages;
  const displayIndex = isDriven ? Math.max(0, history.length - 1) : index;
  const currentMessage = isDriven
    ? (history[history.length - 1] ?? '')
    : (uniqueMessages[index] ?? '');

  return (
    <div className="ms-progress-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="ms-progress-loader__text-window">
        <div
          className="ms-progress-loader__text-strip"
          style={{
            transform:
              displayMessages.length > 0
                ? `translateY(-${displayIndex * (100 / displayMessages.length)}%)`
                : 'none',
          }}
        >
          {displayMessages.map((m, i) => (
            <span
              key={isDriven ? `${i}-${m}` : m}
              className="ms-progress-loader__message"
            >
              {m}
            </span>
          ))}
        </div>
        <span className="ms-sr-only">{currentMessage}</span>
      </div>
      <div className="ms-progress-loader__track" aria-hidden="true">
        <div
          className="ms-progress-loader__bar"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      <span className="ms-progress-loader__percent">{Math.round(clampedProgress)}%</span>
    </div>
  );
}
