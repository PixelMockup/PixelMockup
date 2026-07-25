/**
 * Catalog screen rects from deviceScreens.json (native SVG/PNG pixels).
 * Used to clip the HTML/canvas screen photo to the device aperture.
 */

import deviceScreens from './assets/deviceScreens.json';
import type { ContentBounds } from './imageContentBounds';

export interface DeviceScreenRect extends ContentBounds {
  /** Corner radius in native pixels (0 = sharp). */
  rx: number;
}

type ScreenMap = Record<
  string,
  { x: number; y: number; width: number; height: number; rx: number }
>;

const SCREEN_MAP = deviceScreens as ScreenMap;

export function getCatalogScreenRect(
  catalogFile: string | null | undefined,
): DeviceScreenRect | null {
  if (!catalogFile) return null;
  const entry = SCREEN_MAP[catalogFile];
  if (!entry) return null;
  const width = Math.max(1, Math.round(entry.width));
  const height = Math.max(1, Math.round(entry.height));
  return {
    x: Math.round(entry.x),
    y: Math.round(entry.y),
    width,
    height,
    rx: Math.max(0, Number(entry.rx) || 0),
  };
}

/**
 * Map a native screen rect into percentages of the content-cropped frame,
 * for CSS `clip-path: inset(top right bottom left round rx)`.
 */
export function screenClipInsetCss(
  screen: DeviceScreenRect | ContentBounds & { rx?: number },
  content: ContentBounds,
): { clipPath: string } {
  const cw = Math.max(1, content.width);
  const ch = Math.max(1, content.height);
  const left = ((screen.x - content.x) / cw) * 100;
  const top = ((screen.y - content.y) / ch) * 100;
  const right =
    ((content.x + content.width - (screen.x + screen.width)) / cw) * 100;
  const bottom =
    ((content.y + content.height - (screen.y + screen.height)) / ch) * 100;
  const rx = Math.max(0, screen.rx ?? 0);
  const rxPct = (rx / cw) * 100;
  const ryPct = (rx / ch) * 100;
  const round =
    rx > 0 ? ` round ${rxPct.toFixed(3)}% ${ryPct.toFixed(3)}%` : '';
  return {
    clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%${round})`,
  };
}

/**
 * Map native screen rect into display-space coordinates (artboard / export).
 */
export function mapScreenRectToDisplay(
  screen: DeviceScreenRect | ContentBounds & { rx?: number },
  content: ContentBounds,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): { x: number; y: number; width: number; height: number; rx: number } {
  const cw = Math.max(1, content.width);
  const ch = Math.max(1, content.height);
  const sx = dw / cw;
  const sy = dh / ch;
  const rx = Math.max(0, screen.rx ?? 0);
  return {
    x: dx + (screen.x - content.x) * sx,
    y: dy + (screen.y - content.y) * sy,
    width: screen.width * sx,
    height: screen.height * sy,
    rx: rx * Math.min(sx, sy),
  };
}
