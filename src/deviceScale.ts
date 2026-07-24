/** Fallback category widths if mm catalog entry is missing. */
export const CATEGORY_DISPLAY_WIDTH: Record<string, number> = {
  watches: 55,
  phones: 100,
  tablets: 160,
  computers: 280,
  displays: 300,
};

export const CATEGORY_ORDER = [
  'phones',
  'tablets',
  'watches',
  'computers',
  'displays',
] as const;

export type DeviceCategory = (typeof CATEGORY_ORDER)[number] | string;

/** Fixed 16:9 editing / export artboard (logical pixels). */
export const ARTBOARD_WIDTH = 1280;
export const ARTBOARD_HEIGHT = 720;

/**
 * Shared real-world scale: ~350mm-wide laptop ≈ 480px on the artboard.
 * Phones ≈ 100–110px; watches ≈ 45–55px.
 */
export const PX_PER_MM = 480 / 350;

/** Longest edge cap for export canvases (never invent detail beyond source). */
export const EXPORT_MAX_EDGE = 8192;

export type ExportFormat = 'png' | 'jpg';
export type ExportResolution = 'best' | '1440p' | '1080p' | '720p';

/** Target longest edge for resolution presets (Best uses native scale). */
export const RESOLUTION_PRESETS: Record<
  Exclude<ExportResolution, 'best'>,
  number
> = {
  '1440p': 2560,
  '1080p': 1920,
  '720p': 1280,
};

export const JPEG_QUALITY = 0.92;

export function getDisplayWidth(category: string): number {
  return CATEGORY_DISPLAY_WIDTH[category] ?? 120;
}

export function displayHeightFor(
  displayWidth: number,
  nativeWidth: number,
  nativeHeight: number,
): number {
  if (nativeWidth <= 0) return displayWidth;
  return displayWidth * (nativeHeight / nativeWidth);
}

/** Artboard height from mm width + cropped content aspect (hugs open laptops, etc.). */
export function displayHeightForContent(
  displayWidth: number,
  contentWidth: number,
  contentHeight: number,
  fallbackHeight: number,
): number {
  if (contentWidth <= 0 || contentHeight <= 0) return fallbackHeight;
  return displayWidth * (contentHeight / contentWidth);
}

export interface DisplaySizeFromMmOptions {
  name?: string;
  category?: string;
  /** Image pixel size — used for Open watch strap aspect. */
  nativeWidth?: number;
  nativeHeight?: number;
}

/**
 * Convert catalog body mm to artboard logical pixels (shared scale).
 * Landscape / 90deg swaps axes. Open watches keep case width, height from image aspect.
 */
export function displaySizeFromMm(
  widthMm: number | undefined,
  heightMm: number | undefined,
  options: DisplaySizeFromMmOptions = {},
): { displayWidth: number; displayHeight: number } {
  const { name = '', category = '', nativeWidth = 0, nativeHeight = 0 } = options;

  let wMm = widthMm;
  let hMm = heightMm;

  if (wMm == null || hMm == null || wMm <= 0 || hMm <= 0) {
    const fallbackW = getDisplayWidth(category);
    return {
      displayWidth: fallbackW,
      displayHeight:
        nativeWidth > 0
          ? displayHeightFor(fallbackW, nativeWidth, nativeHeight)
          : fallbackW * 2,
    };
  }

  const rotated =
    /\bLandscape\b/i.test(name) || /\b90deg\b/i.test(name);
  if (rotated) {
    [wMm, hMm] = [hMm, wMm];
  }

  const displayWidth = wMm * PX_PER_MM;
  const isOpenWatch =
    category === 'watches' && /\bOpen\b/i.test(name);

  if (isOpenWatch && nativeWidth > 0 && nativeHeight > 0) {
    return {
      displayWidth,
      displayHeight: displayHeightFor(displayWidth, nativeWidth, nativeHeight),
    };
  }

  return {
    displayWidth,
    displayHeight: hMm * PX_PER_MM,
  };
}
