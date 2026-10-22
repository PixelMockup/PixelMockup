import { useRef, useEffect, useCallback } from 'react';
import { calculateSmoothZoom, clampScale, type ZoomTransform } from './smoothZoomUtils';

const SMOOTHING = 0.2;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function useSmoothZoom() {
  const rafRef = useRef<number>(0);
  const targetRef = useRef<ZoomTransform>({ scale: 1, x: 0, y: 0 });
  const currentRef = useRef<ZoomTransform>({ scale: 1, x: 0, y: 0 });

  const start = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      const cur = currentRef.current;
      const tar = targetRef.current;
      currentRef.current = {
        scale: lerp(cur.scale, tar.scale, SMOOTHING),
        x: lerp(cur.x, tar.x, SMOOTHING),
        y: lerp(cur.y, tar.y, SMOOTHING),
      };
      if (
        Math.abs(cur.scale - tar.scale) > 0.01 ||
        Math.abs(cur.x - tar.x) > 0.5 ||
        Math.abs(cur.y - tar.y) > 0.5
      ) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
        currentRef.current = { ...tar };
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const setTarget = useCallback((t: Partial<ZoomTransform>) => {
    targetRef.current = { ...targetRef.current, ...t };
    start();
  }, [start]);

  const velocity = useRef({ scale: 0, x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    current: currentRef,
    target: targetRef,
    setTarget,
    velocity,
  };
}
