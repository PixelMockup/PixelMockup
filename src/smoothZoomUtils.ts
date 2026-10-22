/**
 * Smooth exponential zoom utilities (Canva-style).
 */

export interface ZoomTransform {
  scale: number;
  x: number;
  y: number;
}

const DEFAULT_SENSITIVITY = 0.0015;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;

export function calculateSmoothZoom(
  currentScale: number,
  deltaY: number,
  sensitivity = DEFAULT_SENSITIVITY
): number {
  const scaleFactor = Math.exp(-deltaY * sensitivity);
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale * scaleFactor));
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

export function calculateWheelZoom(
  current: ZoomTransform,
  cursor: { x: number; y: number },
  deltaY: number,
  sensitivity = DEFAULT_SENSITIVITY,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE
): ZoomTransform {
  const scaleFactor = Math.exp(-deltaY * sensitivity);
  const newScale = Math.max(minScale, Math.min(maxScale, current.scale * scaleFactor));
  const actualFactor = newScale / current.scale;

  // Keep cursor stationary in content space (anchor zoom to pointer)
  const newX = cursor.x - (cursor.x - current.x) * actualFactor;
  const newY = cursor.y - (cursor.y - current.y) * actualFactor;

  return { scale: newScale, x: newX, y: newY };
}

export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
