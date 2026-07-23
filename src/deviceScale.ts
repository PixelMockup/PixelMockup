/** Preview widths by category — approximate real-world relative size. */
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
