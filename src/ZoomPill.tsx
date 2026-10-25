import { Minus, Plus, Maximize } from 'lucide-react';
import { clampViewZoom } from './artboardSnap';
import type { ViewZoom } from './artboardSnap';

type Props = {
  viewZoom: ViewZoom;
  liveScale: number;
  onViewZoom: (v: ViewZoom) => void;
};

export default function ZoomPill({ viewZoom, liveScale, onViewZoom }: Readonly<Props>) {
  const isFit = viewZoom === 'fit';
  const displayPct = isFit ? Math.round(liveScale * 100) : Math.round(Number(viewZoom) * 100);

  const stepUp = () => {
    const current = typeof viewZoom === 'number' ? viewZoom : liveScale;
    onViewZoom(clampViewZoom(Math.round((current + 0.25) / 0.25) * 0.25) as ViewZoom);
  };

  const stepDown = () => {
    const current = typeof viewZoom === 'number' ? viewZoom : liveScale;
    onViewZoom(clampViewZoom(Math.round((current - 0.25) / 0.25) * 0.25) as ViewZoom);
  };

  return (
    <div
      className="ms-zoom-pill-wrapper"
      aria-label="Zoom controls"
      role="group"
    >
      <div className="ms-zoom-pill">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={stepDown}
          className="ms-zoom-pill-btn ms-zoom-pill-btn--round"
        >
          <Minus size={16} strokeWidth={2.5} />
        </button>

        <span className="ms-zoom-pill-label" aria-live="polite">
          {`${displayPct}%`}
        </span>

        <button
          type="button"
          aria-label="Zoom in"
          onClick={stepUp}
          className="ms-zoom-pill-btn ms-zoom-pill-btn--round"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>

        <span className="ms-zoom-pill-divider" aria-hidden="true" />

        <button
          type="button"
          aria-label="Fit artboard"
          aria-pressed={isFit}
          onClick={() => onViewZoom('fit')}
          className={`ms-zoom-pill-btn ms-zoom-pill-btn--fit ${isFit ? 'is-active' : ''}`}
        >
          <Maximize size={14} strokeWidth={2} />
          <span>Fit</span>
        </button>
      </div>
    </div>
  );
}
