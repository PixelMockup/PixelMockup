import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  displayHeightFor,
  EXPORT_MAX_EDGE,
  JPEG_QUALITY,
  RESOLUTION_PRESETS,
  type ExportFormat,
  type ExportResolution,
} from './deviceScale';
import { coverCropRectWithFraming } from './deviceScreenBounds';
import { mapScreenRectToDisplay } from './deviceScreens';
import {
  getImageContentBounds,
  type ContentBounds,
} from './imageContentBounds';
import { loadImage } from './loadImage';

export type ExportBgMode = 'transparent' | 'color' | 'image';

export interface ExportBackground {
  mode: ExportBgMode;
  /** Used when mode is `color` (and as JPG fallback). */
  color: string;
  /** Object URL or data URL when mode is `image`. */
  imageSrc?: string | null;
}

export interface ExportableItem {
  src: string;
  x: number;
  y: number;
  zIndex: number;
  displayWidth: number;
  /** Explicit artboard height (mm-derived). Falls back to image aspect if omitted. */
  displayHeight?: number;
  nativeWidth: number;
  nativeHeight: number;
  /** Opaque crop in native pixels; re-detected if missing. */
  contentBounds?: ContentBounds;
  /** User image drawn on the device screen (under a punched frame `src`). */
  screenImageSrc?: string | null;
  /** Screen rect in native device pixels (same space as `contentBounds`). */
  screenBounds?: ContentBounds | null;
  /** Corner radius in native pixels (0 = sharp). */
  screenRx?: number;
  screenPanX?: number;
  screenPanY?: number;
  screenZoom?: number;
}

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  background?: ExportBackground;
}

export interface ExportResult {
  blob: Blob;
  filenameHint: string;
}

/**
 * Cover-fit a screen image into a mapped screen destination rect
 * (SVG preserveAspectRatio xMidYMid slice equivalent).
 */
export function getClippedScreenPlacement(
  srcWidth: number,
  srcHeight: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  panX: number = 0,
  panY: number = 0,
  zoom: number = 1,
) {
  return {
    crop: coverCropRectWithFraming(srcWidth, srcHeight, destW, destH, {
      panX,
      panY,
      zoom,
    }),
    destination: { x: destX, y: destY, width: destW, height: destH },
  };
}

/**
 * @deprecated Prefer getClippedScreenPlacement with a mapped screen rect.
 * Kept for tests covering full-frame cover-fit math.
 */
export function getFullBleedScreenPlacement(
  srcWidth: number,
  srcHeight: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  panX: number = 0,
  panY: number = 0,
  zoom: number = 1,
) {
  return getClippedScreenPlacement(
    srcWidth,
    srcHeight,
    dx,
    dy,
    dw,
    dh,
    panX,
    panY,
    zoom,
  );
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
) {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? JPEG_QUALITY : undefined;
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      mime,
      quality,
    );
  });
}

async function paintBackground(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  format: ExportFormat,
  background?: ExportBackground,
) {
  const mode = background?.mode ?? (format === 'jpg' ? 'color' : 'transparent');
  const color = background?.color || '#ffffff';

  if (mode === 'transparent') {
    if (format === 'jpg') {
      ctx.fillStyle = color || '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    } else {
      ctx.clearRect(0, 0, outW, outH);
    }
    return;
  }

  if (mode === 'color') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, outW, outH);
    return;
  }

  if (background?.imageSrc) {
    try {
      const img = await loadImage(background.imageSrc);
      const scale = Math.max(outW / img.naturalWidth, outH / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (outW - dw) / 2;
      const dy = (outH - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      return;
    } catch {
      // fall through
    }
  }
  ctx.fillStyle = color || '#000000';
  ctx.fillRect(0, 0, outW, outH);
}

/**
 * Compose a high-res image matching the fixed artboard (WYSIWYG).
 * Frame defaults to 16:9; pass active artboard width/height from the studio.
 */
export async function exportMockup(
  items: ExportableItem[],
  options: ExportOptions,
  panelWidth: number = ARTBOARD_WIDTH,
  panelHeight: number = ARTBOARD_HEIGHT,
): Promise<ExportResult> {
  if (items.length === 0) {
    throw new Error('Nothing to export');
  }

  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);

  const withNative = await Promise.all(
    sorted.map(async (item) => {
      const img = await loadImage(item.src);
      const nativeWidth = item.nativeWidth || img.naturalWidth;
      const nativeHeight = item.nativeHeight || img.naturalHeight;
      const displayHeight =
        item.displayHeight ??
        displayHeightFor(item.displayWidth, nativeWidth, nativeHeight);
      const contentBounds =
        item.contentBounds ?? (await getImageContentBounds(item.src));
      let screenImg: HTMLImageElement | null = null;
      if (item.screenImageSrc && item.screenBounds) {
        try {
          screenImg = await loadImage(item.screenImageSrc);
        } catch {
          screenImg = null;
        }
      }
      return {
        ...item,
        img,
        nativeWidth,
        nativeHeight,
        displayHeight,
        contentBounds,
        screenImg,
      };
    }),
  );

  const bounds = {
    x: 0,
    y: 0,
    width: panelWidth,
    height: panelHeight,
  };

  let maxNativeWidth = 0;
  let maxDisplayWidth = 0;
  for (const item of withNative) {
    maxNativeWidth = Math.max(maxNativeWidth, item.nativeWidth);
    maxDisplayWidth = Math.max(maxDisplayWidth, item.displayWidth);
  }

  let bestScale =
    maxDisplayWidth > 0 ? maxNativeWidth / maxDisplayWidth : 1;

  const bestLongest = Math.max(
    bounds.width * bestScale,
    bounds.height * bestScale,
  );
  if (bestLongest > EXPORT_MAX_EDGE) {
    bestScale *= EXPORT_MAX_EDGE / bestLongest;
  }

  let exportScale = bestScale;
  if (options.resolution !== 'best') {
    const target = RESOLUTION_PRESETS[options.resolution];
    const presetScale =
      Math.max(bounds.width, bounds.height) > 0
        ? target / Math.max(bounds.width, bounds.height)
        : bestScale;
    exportScale = Math.min(bestScale, presetScale);
  }

  const outW = Math.max(1, Math.round(bounds.width * exportScale));
  const outH = Math.max(1, Math.round(bounds.height * exportScale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  await paintBackground(ctx, outW, outH, options.format, options.background);

  ctx.beginPath();
  ctx.rect(0, 0, outW, outH);
  ctx.clip();

  for (const item of withNative) {
    const dx = item.x * exportScale;
    const dy = item.y * exportScale;
    const dw = item.displayWidth * exportScale;
    const dh = item.displayHeight * exportScale;
    const { x: sx, y: sy, width: sw, height: sh } = item.contentBounds;

    // Clip screen photo to the catalog/detected screen rect (cover / slice).
    if (item.screenImg && item.screenBounds) {
      const mapped = mapScreenRectToDisplay(
        { ...item.screenBounds, rx: item.screenRx ?? 0 },
        item.contentBounds,
        dx,
        dy,
        dw,
        dh,
      );
      const { crop, destination } = getClippedScreenPlacement(
        item.screenImg.naturalWidth,
        item.screenImg.naturalHeight,
        mapped.x,
        mapped.y,
        mapped.width,
        mapped.height,
        item.screenPanX ?? 0,
        item.screenPanY ?? 0,
        item.screenZoom ?? 1,
      );
      ctx.save();
      ctx.beginPath();
      roundRectPath(
        ctx,
        destination.x,
        destination.y,
        destination.width,
        destination.height,
        mapped.rx,
      );
      ctx.clip();
      ctx.drawImage(
        item.screenImg,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        destination.x,
        destination.y,
        destination.width,
        destination.height,
      );
      ctx.restore();
    }

    ctx.drawImage(item.img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  const blob = await canvasToBlob(canvas, options.format);
  const ext = options.format === 'jpg' ? 'jpg' : 'png';
  return {
    blob,
    filenameHint: `mockup-${options.resolution}.${ext}`,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
