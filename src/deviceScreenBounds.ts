/**
 * Detect a device's screen region (large near-white rectangle inside the
 * chassis) and build a "punched" frame bitmap whose screen pixels are
 * transparent, so user images can composite underneath the bezel.
 */

import type { ContentBounds } from './imageContentBounds';

/** Match imageContentBounds.ts / scripts/trim_device_library.py */
const WHITE_THRESHOLD = 248;
const ALPHA_THRESHOLD = 8;

/** Include AA fringe when expanding a transparent screen hole. */
const LOW_ALPHA_EXPAND = 64;

/** Max RGB channel for dark screen-border / inactive LCD chrome. */
const DARK_MAX = 48;

/** Fraction of an expansion strip that must be screen-like to grow. */
const EXPAND_MIN_SCREEN_RATIO = 0.85;

/** Longest edge used for the downsampled detection pass. */
const DETECT_MAX_EDGE = 320;

/** Fallback inset (fraction of content bounds) when detection fails. */
const FALLBACK_INSET = 0.08;

/** Detected screen must cover at least this share of the content bounds. */
const MIN_SCREEN_AREA_RATIO = 0.05;

function isWhitePixel(px: Uint8ClampedArray, i: number): boolean {
  return (
    px[i + 3] > ALPHA_THRESHOLD &&
    px[i] >= WHITE_THRESHOLD &&
    px[i + 1] >= WHITE_THRESHOLD &&
    px[i + 2] >= WHITE_THRESHOLD
  );
}

/** White LCD or near-black aperture chrome (not silver/colored chassis). */
export function isScreenAperturePixel(
  px: Uint8ClampedArray,
  i: number,
): boolean {
  if (px[i + 3] <= ALPHA_THRESHOLD) return false;
  if (isWhitePixel(px, i)) return true;
  return px[i] <= DARK_MAX && px[i + 1] <= DARK_MAX && px[i + 2] <= DARK_MAX;
}

/**
 * Largest axis-aligned rectangle of near-white opaque pixels in RGBA data.
 * Histogram / monotonic-stack method, O(width * height).
 * Returns null when the image has no white pixels at all.
 */
export function largestWhiteRect(
  px: Uint8ClampedArray,
  width: number,
  height: number,
): ContentBounds | null {
  return largestRectWhere(
    px,
    width,
    height,
    (p, i) => isWhitePixel(p, i),
  );
}

/**
 * Largest axis-aligned rectangle of transparent / near-transparent pixels
 * inside an optional limit (typically contentBounds). Used for library
 * devices that already ship with a punched screen hole.
 */
export function largestTransparentRect(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  limit?: ContentBounds,
): ContentBounds | null {
  return largestRectWhere(
    px,
    width,
    height,
    (p, i) => p[i + 3] <= ALPHA_THRESHOLD,
    limit,
  );
}

function largestRectWhere(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  pred: (px: Uint8ClampedArray, i: number) => boolean,
  limit?: ContentBounds,
): ContentBounds | null {
  if (width <= 0 || height <= 0) return null;

  const minX = Math.max(0, limit?.x ?? 0);
  const minY = Math.max(0, limit?.y ?? 0);
  const maxR = Math.min(width, limit ? limit.x + limit.width : width);
  const maxB = Math.min(height, limit ? limit.y + limit.height : height);
  if (maxR <= minX || maxB <= minY) return null;

  const heights = new Int32Array(width);
  let best: ContentBounds | null = null;
  let bestArea = 0;

  const stack: number[] = [];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const rowInLimit = y >= minY && y < maxB;
    for (let x = 0; x < width; x++) {
      const inLimit = rowInLimit && x >= minX && x < maxR;
      heights[x] = inLimit && pred(px, (row + x) * 4) ? heights[x] + 1 : 0;
    }

    stack.length = 0;
    for (let x = 0; x <= width; x++) {
      const h = x < width ? heights[x] : 0;
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const rectH = heights[top];
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
        const rectW = x - left;
        const area = rectH * rectW;
        if (area > bestArea) {
          bestArea = area;
          best = {
            x: left,
            y: y - rectH + 1,
            width: rectW,
            height: rectH,
          };
        }
      }
      stack.push(x);
    }
  }

  return best;
}

/**
 * Grow a white LCD rect outward through dark screen-border chrome until the
 * next strip looks like chassis (silver, color, mid gray). Optional `limit`
 * keeps growth inside content bounds.
 */
export function expandScreenIntoDarkBorder(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  rect: ContentBounds,
  limit?: ContentBounds,
): ContentBounds {
  const minX = Math.max(0, limit?.x ?? 0);
  const minY = Math.max(0, limit?.y ?? 0);
  const maxR = Math.min(width, limit ? limit.x + limit.width : width);
  const maxB = Math.min(height, limit ? limit.y + limit.height : height);

  // Start inside the limit so we never claim chassis outside content.
  let x = Math.max(minX, rect.x);
  let y = Math.max(minY, rect.y);
  let right = Math.min(maxR, rect.x + rect.width);
  let bottom = Math.min(maxB, rect.y + rect.height);
  let rw = Math.max(1, right - x);
  let rh = Math.max(1, bottom - y);

  const stripIsScreen = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean => {
    let total = 0;
    let ok = 0;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * width;
      for (let xx = x0; xx < x1; xx++) {
        total++;
        if (isScreenAperturePixel(px, (row + xx) * 4)) ok++;
      }
    }
    return total > 0 && ok / total >= EXPAND_MIN_SCREEN_RATIO;
  };

  let changed = true;
  // Cap iterations so a pathological image cannot loop forever.
  let guard = Math.max(width, height) + 8;
  while (changed && guard-- > 0) {
    changed = false;
    if (x > minX && stripIsScreen(x - 1, y, x, y + rh)) {
      x -= 1;
      rw += 1;
      changed = true;
    }
    if (x + rw < maxR && stripIsScreen(x + rw, y, x + rw + 1, y + rh)) {
      rw += 1;
      changed = true;
    }
    if (y > minY && stripIsScreen(x, y - 1, x + rw, y)) {
      y -= 1;
      rh += 1;
      changed = true;
    }
    if (y + rh < maxB && stripIsScreen(x, y + rh, x + rw, y + rh + 1)) {
      rh += 1;
      changed = true;
    }
  }

  return {
    x,
    y,
    width: Math.max(1, rw),
    height: Math.max(1, rh),
  };
}

/**
 * Grow a transparent hole outward through low-alpha AA fringe so the photo
 * reaches the bezel. Stops at opaque chassis.
 */
export function expandTransparentIntoLowAlpha(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  rect: ContentBounds,
  limit?: ContentBounds,
  alphaMax: number = LOW_ALPHA_EXPAND,
): ContentBounds {
  const minX = Math.max(0, limit?.x ?? 0);
  const minY = Math.max(0, limit?.y ?? 0);
  const maxR = Math.min(width, limit ? limit.x + limit.width : width);
  const maxB = Math.min(height, limit ? limit.y + limit.height : height);

  let x = Math.max(minX, rect.x);
  let y = Math.max(minY, rect.y);
  let right = Math.min(maxR, rect.x + rect.width);
  let bottom = Math.min(maxB, rect.y + rect.height);
  let rw = Math.max(1, right - x);
  let rh = Math.max(1, bottom - y);

  const stripIsLowAlpha = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean => {
    let total = 0;
    let ok = 0;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * width;
      for (let xx = x0; xx < x1; xx++) {
        total++;
        if (px[(row + xx) * 4 + 3] <= alphaMax) ok++;
      }
    }
    return total > 0 && ok / total >= EXPAND_MIN_SCREEN_RATIO;
  };

  let changed = true;
  let guard = Math.max(width, height) + 8;
  while (changed && guard-- > 0) {
    changed = false;
    if (x > minX && stripIsLowAlpha(x - 1, y, x, y + rh)) {
      x -= 1;
      rw += 1;
      changed = true;
    }
    if (x + rw < maxR && stripIsLowAlpha(x + rw, y, x + rw + 1, y + rh)) {
      rw += 1;
      changed = true;
    }
    if (y > minY && stripIsLowAlpha(x, y - 1, x + rw, y)) {
      y -= 1;
      rh += 1;
      changed = true;
    }
    if (y + rh < maxB && stripIsLowAlpha(x, y + rh, x + rw, y + rh + 1)) {
      rh += 1;
      changed = true;
    }
  }

  return {
    x,
    y,
    width: Math.max(1, rw),
    height: Math.max(1, rh),
  };
}

/** Inset fallback rect used when white-region detection fails. */
export function fallbackScreenBounds(content: ContentBounds): ContentBounds {
  const dx = Math.round(content.width * FALLBACK_INSET);
  const dy = Math.round(content.height * FALLBACK_INSET);
  return {
    x: content.x + dx,
    y: content.y + dy,
    width: Math.max(1, content.width - dx * 2),
    height: Math.max(1, content.height - dy * 2),
  };
}

export const SCREEN_ZOOM_MIN = 1;
export const SCREEN_ZOOM_MAX = 4;
export const SCREEN_PAN_MIN = -1;
export const SCREEN_PAN_MAX = 1;

export type ScreenFraming = {
  /** -1…1, 0 = centered. */
  panX: number;
  /** -1…1, 0 = centered. */
  panY: number;
  /** 1…4, 1 = cover fit. */
  zoom: number;
};

export const DEFAULT_SCREEN_FRAMING: ScreenFraming = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

export function clampScreenPan(v: number): number {
  return Math.min(SCREEN_PAN_MAX, Math.max(SCREEN_PAN_MIN, v));
}

export function clampScreenZoom(v: number): number {
  return Math.min(SCREEN_ZOOM_MAX, Math.max(SCREEN_ZOOM_MIN, v));
}

/**
 * Source crop so `drawImage` fills a destination rect ("cover": fill, crop
 * overflow, keep aspect, center).
 */
export function coverCropRect(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): ContentBounds {
  return coverCropRectWithFraming(
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    DEFAULT_SCREEN_FRAMING,
  );
}

/**
 * Cover crop with pan (-1…1) and zoom (>=1). Zoom shrinks the source window;
 * pan shifts that window within the overflow, clamped to the source.
 */
export function coverCropRectWithFraming(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  framing: ScreenFraming = DEFAULT_SCREEN_FRAMING,
): ContentBounds {
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, srcWidth),
      height: Math.max(1, srcHeight),
    };
  }
  const zoom = clampScreenZoom(framing.zoom);
  const panX = clampScreenPan(framing.panX);
  const panY = clampScreenPan(framing.panY);
  const scale = Math.max(dstWidth / srcWidth, dstHeight / srcHeight) * zoom;
  const cropW = dstWidth / scale;
  const cropH = dstHeight / scale;
  const maxX = Math.max(0, srcWidth - cropW);
  const maxY = Math.max(0, srcHeight - cropH);
  // pan 0 → center; pan ±1 → flush to that edge.
  const x = maxX / 2 + panX * (maxX / 2);
  const y = maxY / 2 + panY * (maxY / 2);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
    width: cropW,
    height: cropH,
  };
}

/**
 * CSS `object-position` percentages for cover + pan.
 * object-position 50% is center; 0%/100% are edges — matches pan -1…1.
 */
export function screenObjectPosition(
  panX: number,
  panY: number,
): { x: number; y: number } {
  const px = clampScreenPan(panX);
  const py = clampScreenPan(panY);
  return {
    x: ((px + 1) / 2) * 100,
    y: ((py + 1) / 2) * 100,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function clampRectTo(rect: ContentBounds, limit: ContentBounds): ContentBounds {
  const x = Math.max(rect.x, limit.x);
  const y = Math.max(rect.y, limit.y);
  const right = Math.min(rect.x + rect.width, limit.x + limit.width);
  const bottom = Math.min(rect.y + rect.height, limit.y + limit.height);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

const SCREEN_DETECT_VERSION = 'transparent-v2';

export interface DeviceScreenInfo {
  bounds: ContentBounds;
  /** True when the source already contains a transparent screen hole. */
  hasTransparentAperture: boolean;
}

const screenBoundsCache = new Map<string, Promise<DeviceScreenInfo>>();

function mapDownToNative(
  rect: ContentBounds,
  inv: number,
  content: ContentBounds,
): ContentBounds {
  const native: ContentBounds = {
    x: Math.round(rect.x * inv),
    y: Math.round(rect.y * inv),
    width: Math.max(1, Math.round(rect.width * inv)),
    height: Math.max(1, Math.round(rect.height * inv)),
  };
  return clampRectTo(native, content);
}

function areaOk(rect: ContentBounds, content: ContentBounds): boolean {
  const minArea = content.width * content.height * MIN_SCREEN_AREA_RATIO;
  return rect.width * rect.height >= minArea;
}

async function computeScreenInfo(
  src: string,
  content: ContentBounds,
): Promise<DeviceScreenInfo> {
  try {
    const img = await loadImage(src);
    const nativeW = img.naturalWidth;
    const nativeH = img.naturalHeight;
    if (nativeW <= 0 || nativeH <= 0) {
      return {
        bounds: fallbackScreenBounds(content),
        hasTransparentAperture: false,
      };
    }

    const scale = Math.min(1, DETECT_MAX_EDGE / Math.max(nativeW, nativeH));
    const w = Math.max(1, Math.round(nativeW * scale));
    const h = Math.max(1, Math.round(nativeH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        bounds: fallbackScreenBounds(content),
        hasTransparentAperture: false,
      };
    }
    // Nearest-like downsample so AA does not shrink the transparent hole.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);

    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, w, h);
    } catch {
      return {
        bounds: fallbackScreenBounds(content),
        hasTransparentAperture: false,
      };
    }

    const limitDown = clampRectTo(
      {
        x: Math.max(0, Math.floor(content.x * scale)),
        y: Math.max(0, Math.floor(content.y * scale)),
        width: Math.max(1, Math.ceil(content.width * scale)),
        height: Math.max(1, Math.ceil(content.height * scale)),
      },
      { x: 0, y: 0, width: w, height: h },
    );
    const inv = 1 / scale;

    // 1) Prefer existing transparent screen hole (most library devices).
    const hole = largestTransparentRect(data.data, w, h, limitDown);
    if (hole) {
      const expanded = expandTransparentIntoLowAlpha(
        data.data,
        w,
        h,
        hole,
        limitDown,
      );
      const clamped = mapDownToNative(expanded, inv, content);
      if (areaOk(clamped, content)) {
        return { bounds: clamped, hasTransparentAperture: true };
      }
    }

    // 2) White LCD + expand into dark aperture chrome.
    const white = largestWhiteRect(data.data, w, h);
    if (white) {
      const expanded = expandScreenIntoDarkBorder(
        data.data,
        w,
        h,
        white,
        limitDown,
      );
      const clamped = mapDownToNative(expanded, inv, content);
      if (areaOk(clamped, content)) {
        return { bounds: clamped, hasTransparentAperture: false };
      }
    }

    // 3) Inset fallback.
    return {
      bounds: fallbackScreenBounds(content),
      hasTransparentAperture: false,
    };
  } catch {
    return {
      bounds: fallbackScreenBounds(content),
      hasTransparentAperture: false,
    };
  }
}

/**
 * Screen detection metadata, memoized by device `src`.
 */
export function getDeviceScreenInfo(
  src: string,
  content: ContentBounds,
): Promise<DeviceScreenInfo> {
  const key = `${SCREEN_DETECT_VERSION}|${src}`;
  let pending = screenBoundsCache.get(key);
  if (!pending) {
    pending = computeScreenInfo(src, content);
    screenBoundsCache.set(key, pending);
  }
  return pending;
}

/** Screen rect in native device pixels (same space as `contentBounds`). */
export async function getDeviceScreenBounds(
  src: string,
  content: ContentBounds,
): Promise<ContentBounds> {
  return (await getDeviceScreenInfo(src, content)).bounds;
}

const punchedCache = new Map<string, Promise<string>>();

async function computePunchedSrc(
  src: string,
  screen: ContentBounds,
): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) return src;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);

  const rx = Math.max(0, Math.floor(screen.x));
  const ry = Math.max(0, Math.floor(screen.y));
  const rw = Math.min(w - rx, Math.ceil(screen.width));
  const rh = Math.min(h - ry, Math.ceil(screen.height));
  if (rw <= 0 || rh <= 0) return src;

  // Hard-clear the full aperture so dark screen chrome does not leave a ring.
  ctx.clearRect(rx, ry, rw, rh);

  return canvas.toDataURL('image/png');
}

/**
 * Device frame with the screen region made transparent so a user image can
 * show through. Returns a data URL; falls back to the original `src` on any
 * failure. Memoized by `src` + screen rect.
 */
export function getPunchedDeviceSrc(
  src: string,
  screen: ContentBounds,
): Promise<string> {
  const key = `${SCREEN_DETECT_VERSION}|${src}|${screen.x},${screen.y},${screen.width},${screen.height}`;
  let pending = punchedCache.get(key);
  if (!pending) {
    pending = computePunchedSrc(src, screen).catch(() => src);
    punchedCache.set(key, pending);
  }
  return pending;
}
