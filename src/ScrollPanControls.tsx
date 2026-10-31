import { useRef, useCallback } from 'react';

type Props = {
  pan: { panX: number; panY: number };
  onPan: (p: { panX: number; panY: number }) => void;
  viewZoom: string | number;
  artboardW: number;
  artboardH: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
};

export default function ScrollPanControls({ pan, onPan, viewZoom, artboardW, artboardH, canvasRef }: Readonly<Props>) {
  if (viewZoom === 'fit') return null;

  const viewport = canvasRef.current?.getBoundingClientRect();
  const vw = viewport ? viewport.width : 800;
  const vh = viewport ? viewport.height : 600;
  const scale = typeof viewZoom === 'number' ? viewZoom : 1;

  const scrollW = Math.max(0, artboardW * scale - vw);
  const scrollH = Math.max(0, artboardH * scale - vh);



  // For simplicity in this minimal version: drag thumb updates pan proportionally
  const vTrackRef = useRef<HTMLDivElement | null>(null);
  const hTrackRef = useRef<HTMLDivElement | null>(null);

  const handleDrag = useCallback((kind: 'h' | 'v', startClient: number, startPan: number, trackLenPx: number) => {
    const onMove = (e: PointerEvent) => {
      const delta = kind === 'h' ? e.clientX - startClient : e.clientY - startClient;
      const ratio = delta / trackLenPx;
      const newPan = startPan - ratio * (kind === 'h' ? scrollW : scrollH);
      if (kind === 'h') {
        onPan({ panX: newPan, panY: pan.panY });
      } else {
        onPan({ panX: pan.panX, panY: newPan });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
  }, [pan, onPan, scrollW, scrollH]);

  const trackYRatio = scrollH > 0 ? Math.max(0, Math.min(1, Math.abs(pan.panY) / scrollH)) : 0;
  const trackYPos = Math.round((1 - trackYRatio) * 100 * 0.8); // approximate thumb position

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 20,
        display: 'flex',
        gap: 8,
        pointerEvents: 'auto',
      }}
      aria-label="Canvas scroll controls"
    >
      {/* Vertical scroll track */}
      <div
        ref={vTrackRef}
        style={{
          width: 8,
          height: 160,
          background: 'rgba(255,255,255,0.3)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          const rect = vTrackRef.current!.getBoundingClientRect();
          const trackLen = rect.height;
          handleDrag('v', e.clientY, -pan.panY, trackLen);
        }}
      >
        {scrollH > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: '100%',
              height: `${Math.max(20, Math.min(120, (vh / (artboardH * scale)) * 160))}px`,
              background: 'var(--ms-accent)',
              borderRadius: 4,
              top: `${trackYPos}%`,
              cursor: 'pointer',
            }}
          />
        )}
      </div>

      {/* Horizontal scroll track */}
      <div
        ref={hTrackRef}
        style={{
          width: 160,
          height: 8,
          background: 'rgba(255,255,255,0.3)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          const rect = hTrackRef.current!.getBoundingClientRect();
          const trackLen = rect.width;
          handleDrag('h', e.clientX, -pan.panX, trackLen);
        }}
      >
        {scrollW > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              width: `${Math.max(20, Math.min(120, (vw / (artboardW * scale)) * 160))}px`,
              background: 'var(--ms-accent)',
              borderRadius: 4,
              left: `${Math.max(0, Math.min(100 - 20, (-pan.panX / scrollW) * 100))}%`,
              cursor: 'pointer',
            }}
          />
        )}
      </div>
    </div>
  );
};
