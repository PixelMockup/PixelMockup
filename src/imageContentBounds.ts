/** Detect content bounds of an image for crop (non-near-white + opaque). */

import { loadImage } from './loadImage';

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Match deviceScreenBounds.ts (thresholds used to trim device_library assets). */
export const WHITE_THRESHOLD = 248;
export const ALPHA_THRESHOLD = 8;

const cache = new Map<string, Promise<ContentBounds>>();

function fullBounds(width: number, height: number): ContentBounds {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function isContentPixel(r: number, g: number, b: number, a: number): boolean {
  if (a <= ALPHA_THRESHOLD) return false;
  // Near-white padding counts as empty (same rule as the trim script).
  if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
    return false;
  }
  return true;
}
function readImageData(
  img: HTMLImageElement,
  w: number,
  h: number,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);

  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    // Tainted canvas or other read failure — use full image.
    return null;
  }
}

function findContentRect(
  px: Uint8ClampedArray,
  w: number,
  h: number
): ContentBounds | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      if (isContentPixel(px[i], px[i + 1], px[i + 2], px[i + 3])) continue;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function computeContentBounds(src: string): Promise<ContentBounds> {
  try {
    const img = await loadImage(src);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w <= 0 || h <= 0) return fullBounds(w, h);

    const data = readImageData(img, w, h);
    if (!data) return fullBounds(w, h);

    return findContentRect(data.data, w, h) ?? fullBounds(w, h);
  } catch {
    return fullBounds(1, 1);
  }
}

/**
 * Content bounding box in native image pixels (opaque and not near-white).
 * Memoized by `src` so repeat placements are cheap.
 */
export function getImageContentBounds(src: string): Promise<ContentBounds> {
  let pending = cache.get(src);
  if (!pending) {
    pending = computeContentBounds(src);
    cache.set(src, pending);
  }
  return pending;
}
