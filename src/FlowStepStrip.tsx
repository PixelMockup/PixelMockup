export type FlowStep = 1 | 2 | 3;

interface FlowStepStripProps {
  step: FlowStep;
  /** Step 2 complete when any device has website or screen image. */
  screensFilled: boolean;
}

const STEPS: { n: FlowStep; label: string }[] = [
  { n: 1, label: 'Add devices' },
  { n: 2, label: 'Fill screens' },
  { n: 3, label: 'Download' },
];

/**
 * Persistent next-step guide. Replaces the dismissible coach banner.
 */
export default function FlowStepStrip({
  step,
  screensFilled,
}: FlowStepStripProps) {
  return (
    <nav className="ms-flow-steps" aria-label="Progress">
      <ol className="ms-flow-steps__list">
        {STEPS.map(({ n, label }, i) => {
          const current = n === step;
          const complete =
            (n === 1 && step > 1) ||
            (n === 2 && screensFilled) ||
            false;
          return (
            <li
              key={n}
              className={[
                'ms-flow-steps__item',
                current ? 'is-current' : '',
                complete ? 'is-complete' : '',
                n === 3 && screensFilled && step === 3 ? 'is-pulse' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={current ? 'step' : undefined}
            >
              <span className="ms-flow-steps__num" aria-hidden="true">
                {complete ? '✓' : n}
              </span>
              <span className="ms-flow-steps__label">{label}</span>
              {i < STEPS.length - 1 ? (
                <span className="ms-flow-steps__sep" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
      <span className="ms-a11y-live" aria-live="polite">
        Step {step}: {STEPS.find((s) => s.n === step)?.label}
        {screensFilled ? '. Screens filled.' : ''}
      </span>
    </nav>
  );
}

/** Derive flow step from canvas state. */
export function flowStepFromState(
  deviceCount: number,
  screensFilled: boolean,
): FlowStep {
  if (deviceCount === 0) return 1;
  if (!screensFilled) return 2;
  return 3;
}
