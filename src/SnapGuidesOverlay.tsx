import type { SnapGuides } from './artboardSnap';

type SnapGuidesOverlayProps = {
  snapGuides: SnapGuides;
  artboardW: number;
  artboardH: number;
};

export default function SnapGuidesOverlay({
  snapGuides,
  artboardW,
  artboardH,
}: SnapGuidesOverlayProps) {
  if (snapGuides.vertical.length === 0 && snapGuides.horizontal.length === 0) {
    return null;
  }

  return (
    <div className="ms-snap-guides" aria-hidden="true">
      {snapGuides.vertical.map((g) => (
        <div
          key={`v-${g.kind}-${g.pos}`}
          className={[
            'ms-snap-guide',
            'ms-snap-guide--v',
            g.kind === 'page'
              ? 'ms-snap-guide--page'
              : 'ms-snap-guide--sibling',
          ].join(' ')}
          style={{ left: `${(g.pos / artboardW) * 100}%` }}
        />
      ))}
      {snapGuides.horizontal.map((g) => (
        <div
          key={`h-${g.kind}-${g.pos}`}
          className={[
            'ms-snap-guide',
            'ms-snap-guide--h',
            g.kind === 'page'
              ? 'ms-snap-guide--page'
              : 'ms-snap-guide--sibling',
          ].join(' ')}
          style={{ top: `${(g.pos / artboardH) * 100}%` }}
        />
      ))}
    </div>
  );
}
