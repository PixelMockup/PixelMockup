import { useCallback, useRef } from 'react';

type LongPressOptions = {
  delay?: number;
  moveTolerance?: number;
};

type LongPressResult = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

/**
 * Detect a long-press on a touch or pen pointer and fire the callback.
 * Cancels if the pointer moves more than `moveTolerance` px or is released early.
 */
export function useLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  options: LongPressOptions = {},
): LongPressResult {
  const { delay = 500, moveTolerance = 10 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    triggeredRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      triggeredRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      timerRef.current = window.setTimeout(() => {
        triggeredRef.current = true;
        onLongPress(e);
        clear();
      }, delay);
    },
    [delay, onLongPress, clear],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > moveTolerance) {
        clear();
      }
    },
    [moveTolerance, clear],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.releasePointerCapture?.(e.pointerId);
      clear();
    },
    [clear],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (startRef.current?.pointerId === e.pointerId) {
        clear();
      }
    },
    [clear],
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Prevent the native context menu only if we are on a touch device and
    // a long press was triggered. On desktop, allow the native right-click.
    if (triggeredRef.current || startRef.current != null) {
      e.preventDefault();
    }
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerMove,
    onContextMenu,
  };
}
