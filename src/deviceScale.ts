/** Fallback category widths if mm catalog entry is missing. */
import { storageGet, storageSet } from './storage';

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

/** Default 16:9 editing / export artboard (logical pixels). Prefer active format. */
export const ARTBOARD_WIDTH = 1280;
export const ARTBOARD_HEIGHT = 720;

export const ARTBOARD_FORMAT_KEY = 'pixelMockup.artboardFormat';
const ARTBOARD_FORMAT_LEGACY_KEY = 'mockupStudio.artboardFormat';

export type ArtboardFormatId =
  | '16-9'
  | '9-16'
  | '1-1'
  | '4-5'
  | '4-3'
  | '3-2'
  | '2-3'
  | '21-9'
  | 'a4-p'
  | 'a4-l';

export interface ArtboardFormat {
  id: ArtboardFormatId;
  /** Short UI label, e.g. "16:9" */
  label: string;
  /** One-line hint for title/tooltip */
  hint: string;
  width: number;
  height: number;
}

/** Professionally recognized canvas formats (recommended ship list). */
export const ARTBOARD_FORMATS: readonly ArtboardFormat[] = [
  {
    id: '16-9',
    label: '16:9',
    hint: 'HDTV / YouTube / web video',
    width: 1280,
    height: 720,
  },
  {
    id: '9-16',
    label: '9:16',
    hint: 'TikTok, Reels, Shorts, Stories',
    width: 720,
    height: 1280,
  },
  {
    id: '1-1',
    label: '1:1',
    hint: 'Square feed / profile-safe',
    width: 1080,
    height: 1080,
  },
  {
    id: '4-5',
    label: '4:5',
    hint: 'Instagram / Facebook feed portrait',
    width: 1080,
    height: 1350,
  },
  {
    id: '4-3',
    label: '4:3',
    hint: 'Classic display / presentation',
    width: 1280,
    height: 960,
  },
  {
    id: '3-2',
    label: '3:2',
    hint: 'Classic photo / APS-C stills',
    width: 1200,
    height: 800,
  },
  {
    id: '2-3',
    label: '2:3',
    hint: 'Pinterest pin portrait',
    width: 1000,
    height: 1500,
  },
  {
    id: '21-9',
    label: '21:9',
    hint: 'Ultrawide / cinematic',
    width: 1680,
    height: 720,
  },
  {
    id: 'a4-p',
    label: 'A4',
    hint: 'ISO 216 A4 portrait',
    width: 794,
    height: 1123,
  },
  {
    id: 'a4-l',
    label: 'A4 landscape',
    hint: 'ISO 216 A4 landscape',
    width: 1123,
    height: 794,
  },
] as const;

export const DEFAULT_ARTBOARD_FORMAT_ID: ArtboardFormatId = '16-9';

export function getArtboardFormat(id: string): ArtboardFormat {
  return (
    ARTBOARD_FORMATS.find((f) => f.id === id) ??
    ARTBOARD_FORMATS.find((f) => f.id === DEFAULT_ARTBOARD_FORMAT_ID)!
  );
}

export function readStoredArtboardFormatId(): ArtboardFormatId {
  try {
    const raw = storageGet(ARTBOARD_FORMAT_KEY, ARTBOARD_FORMAT_LEGACY_KEY);
    if (raw && ARTBOARD_FORMATS.some((f) => f.id === raw)) {
      return raw as ArtboardFormatId;
    }
  } catch {
    // ignore
  }
  return DEFAULT_ARTBOARD_FORMAT_ID;
}

export function persistArtboardFormatId(id: ArtboardFormatId) {
  try {
    storageSet(ARTBOARD_FORMAT_KEY, id);
  } catch {
    // ignore
  }
}

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

/** Artboard device size presets (2× = today’s mm baseline). */
export const SIZE_SCALE_STORAGE_KEY = 'pixelMockup.sizeScale';
const SIZE_SCALE_LEGACY_KEY = 'mockupStudio.sizeScale';

export type SizeScaleId = '2x' | '1x' | '0.5x' | '0.25x';

export interface SizeScalePreset {
  id: SizeScaleId;
  label: string;
  /** Multiplier vs today’s PX_PER_MM baseline (2× = 1). */
  factor: number;
}

export const SIZE_SCALE_PRESETS: readonly SizeScalePreset[] = [
  {
    id: '2x',
    label: 'Actual',
    factor: 1,
  },
  {
    id: '1x',
    label: 'Half',
    factor: 0.5,
  },
  {
    id: '0.5x',
    label: 'Quarter',
    factor: 0.25,
  },
  {
    id: '0.25x',
    label: 'Eighth',
    factor: 0.125,
  },
] as const;

export const DEFAULT_SIZE_SCALE_ID: SizeScaleId = '1x';

export function getSizeScalePreset(id: string): SizeScalePreset {
  return (
    SIZE_SCALE_PRESETS.find((p) => p.id === id) ??
    SIZE_SCALE_PRESETS.find((p) => p.id === DEFAULT_SIZE_SCALE_ID)!
  );
}

export function readStoredSizeScaleId(): SizeScaleId {
  try {
    const raw = storageGet(SIZE_SCALE_STORAGE_KEY, SIZE_SCALE_LEGACY_KEY);
    if (raw && SIZE_SCALE_PRESETS.some((p) => p.id === raw)) {
      return raw as SizeScaleId;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SIZE_SCALE_ID;
}

export function persistSizeScaleId(id: SizeScaleId) {
  try {
    storageSet(SIZE_SCALE_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function applySizeScale(
  displayWidth: number,
  displayHeight: number,
  factor: number,
): { displayWidth: number; displayHeight: number } {
  return {
    displayWidth: displayWidth * factor,
    displayHeight: displayHeight * factor,
  };
}

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
