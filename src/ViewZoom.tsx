import { stepViewZoom, viewZoomLabel, type ViewZoom } from './artboardSnap';

type ViewZoomProps = {
  viewZoom: ViewZoom;
  onViewZoom: (zoom: ViewZoom) => void;
};

export default function ViewZoom({ viewZoom, onViewZoom }: Readonly<ViewZoomProps>) {
  return (
    <fieldset className="ms-view-zoom" aria-label="Canvas zoom">
      <button
        type="button"
        className="ms-btn ms-btn--icon"
        aria-pressed={viewZoom === 'fit'}
        title="Fit fills the window · 100% = artboard pixels"
        aria-label="Fit artboard to stage"
        onClick={() => onViewZoom('fit')}
      >
        Fit
      </button>
      <button
        type="button"
        className="ms-btn ms-btn--icon"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => onViewZoom(stepViewZoom(viewZoom, -1))}
      >
        −
      </button>
      <span
        className="ms-view-zoom-label"
        title="Fit fills the window · 100% = artboard pixels"
      >
        {viewZoomLabel(viewZoom)}
      </span>
      <button
        type="button"
        className="ms-btn ms-btn--icon"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => onViewZoom(stepViewZoom(viewZoom, 1))}
      >
        +
      </button>
    </fieldset>
  );
}
