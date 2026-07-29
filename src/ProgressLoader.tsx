import { useEffect, useMemo, useRef, useState } from 'react';
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
};

const log = (
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  runId = 'initial',
) => {
  // #region agent log
  fetch('http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '741bd0',
    },
    body: JSON.stringify({
      sessionId: '741bd0',
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
};

export default function ProgressLoader({
  progress,
  messages,
  intervalMs = 1800,
  label = 'Loading…',
}: Readonly<ProgressLoaderProps>) {
  const [index, setIndex] = useState(0);
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const currentMessage = messages[index] ?? '';
  const textWindowRef = useRef<HTMLDivElement | null>(null);

  const uniqueMessages = useMemo(
    () => messages.filter((m) => m.trim() !== ''),
    [messages],
  );

  // #region agent log
  log('H1', 'ProgressLoader.tsx:46', 'ProgressLoader props', {
    progress,
    messages,
    uniqueMessagesLength: uniqueMessages.length,
    index,
    intervalMs,
  });
  // #endregion

  useEffect(() => {
    if (uniqueMessages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % uniqueMessages.length;
        // #region agent log
        log('H1', 'ProgressLoader.tsx:60', 'Message index changed', {
          previousIndex: i,
          nextIndex: next,
          message: uniqueMessages[next],
        });
        // #endregion
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [uniqueMessages, intervalMs]);

  useEffect(() => {
    const el = textWindowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const strip = el.querySelector('.ms-progress-loader__text-strip') as HTMLElement | null;
    const stripRect = strip?.getBoundingClientRect();
    const firstMessage = el.querySelector('.ms-progress-loader__message') as HTMLElement | null;
    const computed = firstMessage ? window.getComputedStyle(firstMessage) : null;
    // #region agent log
    log('H2', 'ProgressLoader.tsx:79', 'Text window dimensions', {
      windowWidth: rect.width,
      windowHeight: rect.height,
      stripWidth: stripRect?.width,
      stripHeight: stripRect?.height,
      messageColor: computed?.color,
      messageFontSize: computed?.fontSize,
      messageDisplay: computed?.display,
      childrenCount: el.children.length,
    });
    // #endregion
  }, [uniqueMessages, index]);

  return (
    <div className="ms-progress-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="ms-progress-loader__text-window" ref={textWindowRef}>
        <div
          className="ms-progress-loader__text-strip"
          style={{
            transform:
              uniqueMessages.length > 0
                ? `translateY(-${index * (100 / uniqueMessages.length)}%)`
                : 'none',
          }}
        >
          {uniqueMessages.map((m) => (
            <span key={m} className="ms-progress-loader__message">
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
