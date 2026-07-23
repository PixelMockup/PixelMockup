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

/** Longest edge cap for export canvases (never invent detail beyond source). */
export const EXPORT_MAX_EDGE = 8192;

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
