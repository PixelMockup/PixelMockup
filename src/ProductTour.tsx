import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { TOUR_STEPS, findTarget, type Placement } from './tourSteps';

type ProductTourProps = {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

type Insets = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

type ViewportBounds = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

const MARGIN = 12;

function readSafeAreaInsets(): Insets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, left: 0, right: 0, bottom: 0 };
  }
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.paddingTop = 'env(safe-area-inset-top)';
  el.style.paddingRight = 'env(safe-area-inset-right)';
  el.style.paddingBottom = 'env(safe-area-inset-bottom)';
  el.style.paddingLeft = 'env(safe-area-inset-left)';
  document.body.appendChild(el);
  const s = getComputedStyle(el);
  const parse = (v: string) => Number.parseFloat(v) || 0;
  const insets = {
    top: parse(s.paddingTop),
    right: parse(s.paddingRight),
    bottom: parse(s.paddingBottom),
    left: parse(s.paddingLeft),
  };
  document.body.removeChild(el);
  return insets;
}

function useSafeAreaInsets(): Insets {
  const [insets, setInsets] = useState<Insets>({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });

  useEffect(() => {
    const update = () => setInsets(readSafeAreaInsets());
    update();
    window.addEventListener('resize', update);
    if (screen.orientation) {
      screen.orientation.addEventListener?.('change', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (screen.orientation) {
        screen.orientation.removeEventListener?.('change', update);
      }
    };
  }, []);

  return insets;
}

function getViewportBounds(insets: Insets): ViewportBounds {
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;
  return {
    top: MARGIN + insets.top,
    left: MARGIN + insets.left,
    right: Math.max(MARGIN, maxWidth - MARGIN - insets.right),
    bottom: Math.max(MARGIN, maxHeight - MARGIN - insets.bottom),
  };
}

function useTargetRect(stepIndex: number): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!TOUR_STEPS[stepIndex]) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = findTarget(TOUR_STEPS[stepIndex]);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener('resize', update);
    if (screen.orientation) {
      screen.orientation.addEventListener?.('change', update);
    }
    const id = window.setTimeout(update, 50);
    return () => {
      window.removeEventListener('resize', update);
      if (screen.orientation) {
        screen.orientation.removeEventListener?.('change', update);
      }
      window.clearTimeout(id);
    };
  }, [stepIndex]);

  return rect;
}

function useCardSize(
  cardRef: React.RefObject<HTMLDivElement | null>,
  stepIndex: number,
  open: boolean,
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setSize(null);
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    const update = () => {
      const r = card.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(card);
    return () => ro.disconnect();
  }, [cardRef, stepIndex, open]);

  return size;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function idealTopLeft(
  placement: Placement,
  target: DOMRect,
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const spacing = 12;
  switch (placement) {
    case 'top':
      return { x: cx - cardW / 2, y: target.top - spacing - cardH };
    case 'bottom':
      return { x: cx - cardW / 2, y: target.bottom + spacing };
    case 'left':
      return { x: target.left - spacing - cardW, y: cy - cardH / 2 };
    case 'right':
      return { x: target.right + spacing, y: cy - cardH / 2 };
    case 'center':
      return { x: cx - cardW / 2, y: cy - cardH / 2 };
  }
}

function evaluatePlacement(
  placement: Placement,
  target: DOMRect,
  cardW: number,
  cardH: number,
  bounds: ViewportBounds,
) {
  const ideal = idealTopLeft(placement, target, cardW, cardH);
  const minX = bounds.left;
  const maxX = Math.max(bounds.left, bounds.right - cardW);
  const minY = bounds.top;
  const maxY = Math.max(bounds.top, bounds.bottom - cardH);
  const clamped = {
    x: clamp(ideal.x, minX, maxX),
    y: clamp(ideal.y, minY, maxY),
  };

  const overflowLeft = Math.max(0, bounds.left - clamped.x);
  const overflowRight = Math.max(0, clamped.x + cardW - bounds.right);
  const overflowTop = Math.max(0, bounds.top - clamped.y);
  const overflowBottom = Math.max(0, clamped.y + cardH - bounds.bottom);
  const visibleW = Math.max(0, cardW - overflowLeft - overflowRight);
  const visibleH = Math.max(0, cardH - overflowTop - overflowBottom);
  const overflowArea = Math.max(0, cardW * cardH - visibleW * visibleH);

  const dx = clamped.x - ideal.x;
  const dy = clamped.y - ideal.y;
  const displacement = dx * dx + dy * dy;

  return { placement, clamped, overflowArea, displacement };
}

function computeTooltipStyle(
  target: DOMRect,
  preferredPlacement: Placement,
  cardW: number,
  cardH: number,
  bounds: ViewportBounds,
): { style: React.CSSProperties; placement: Placement } {
  const FALLBACKS: Record<Placement, Placement[]> = {
    top: ['top', 'bottom', 'right', 'left', 'center'],
    bottom: ['bottom', 'top', 'right', 'left', 'center'],
    left: ['left', 'right', 'bottom', 'top', 'center'],
    right: ['right', 'bottom', 'left', 'top', 'center'],
    center: ['center', 'bottom', 'right', 'left', 'top'],
  };

  const candidates = FALLBACKS[preferredPlacement].map((p) =>
    evaluatePlacement(p, target, cardW, cardH, bounds),
  );

  for (const c of candidates) {
    if (c.overflowArea === 0) {
      return {
        style: {
          top: c.clamped.y,
          left: c.clamped.x,
          transform: 'none',
        },
        placement: c.placement,
      };
    }
  }

  candidates.sort((a, b) => {
    if (a.overflowArea !== b.overflowArea) return a.overflowArea - b.overflowArea;
    return a.displacement - b.displacement;
  });

  const best = candidates[0];
  return {
    style: {
      top: best.clamped.y,
      left: best.clamped.x,
      transform: 'none',
    },
    placement: best.placement,
  };
}

export default function ProductTour({
  open,
  onClose: _onClose,
  onComplete,
}: Readonly<ProductTourProps>) {
  const [stepIndex, setStepIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const liveId = useId();
  const rect = useTargetRect(stepIndex);
  const cardSize = useCardSize(cardRef, stepIndex, open);
  const insets = useSafeAreaInsets();

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex >= TOUR_STEPS.length - 1;

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return;
    }
    const id = window.setTimeout(() => {
      cardRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onComplete]);

  useEffect(() => {
    if (!open) return;
    const el = findTarget(TOUR_STEPS[stepIndex]);
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }
  }, [open, stepIndex]);

  if (!open || !step) return null;

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const skip = () => {
    onComplete();
  };

  const spotlight = rect
    ? {
      top: rect.top - 8,
      left: rect.left - 8,
      width: rect.width + 16,
      height: rect.height + 16,
    }
    : { top: '50%', left: '50%', width: 0, height: 0 };

  const bounds = getViewportBounds(insets);
  const availableHeight = Math.max(0, bounds.bottom - bounds.top);

  const tooltipResult = rect && cardSize
    ? computeTooltipStyle(
      rect,
      step.placement,
      cardSize.width,
      cardSize.height,
      bounds,
    )
    : {
      style: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
      placement: 'center' as Placement,
    };

  const tooltipPlacement = tooltipResult.placement;

  const cardStyle: React.CSSProperties = {
    ...tooltipResult.style,
    maxHeight: availableHeight,
    opacity: cardSize ? 1 : 0,
  };

  return (
    <div
      className="ms-tour"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      <div className="ms-tour__overlay" />
      <div
        className="ms-tour__spotlight"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
        }}
      />
      <div
        ref={cardRef}
        className={`ms-tour__card ms-tour__card--${tooltipPlacement}`}
        style={cardStyle}
        tabIndex={-1}
        role="document"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={`ms-tour__arrow ms-tour__arrow--${tooltipPlacement}`} aria-hidden="true" />
        <div className="ms-tour__content" style={{ overflowY: 'auto' }}>
          <p id={liveId} className="ms-sr-only" aria-live="polite">
            Step {stepIndex + 1} of {TOUR_STEPS.length}: {step.title}. {step.body}
          </p>
          <h2 id={titleId} className="ms-tour__title">
            {step.title}
          </h2>
          <p className="ms-tour__body">{step.body}</p>
          <div className="ms-tour__progress" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`ms-tour__dot${i === stepIndex ? ' is-active' : ''}`}
              />
            ))}
          </div>
          <div className="ms-tour__actions">
            <button
              type="button"
              className="ms-btn ms-btn--ghost"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="ms-btn ms-btn--primary"
              onClick={goNext}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
          <button
            type="button"
            className="ms-text-btn ms-tour__skip"
            onClick={skip}
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
