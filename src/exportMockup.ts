import {
  displayHeightFor,
  EXPORT_CONTENT_PADDING,
  EXPORT_MAX_EDGE,
  JPEG_QUALITY,
  RESOLUTION_PRESETS,
  type ExportFormat,
  type ExportResolution,
} from './deviceScale';

export interface ExportableItem {
  src: string;
  x: number;
  y: number;
  zIndex: number;
  displayWidth: number;
  nativeWidth: number;
  nativeHeight: number;
}

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
}

export interface ExportResult {
  blob: Blob;
  filenameHint: string;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

function intersectBounds(a: Bounds, b: Bounds): Bounds | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function contentBounds(
  items: { x: number; y: number; displayWidth: number; displayHeight: number }[],
  panelWidth: number,
  panelHeight: number,
  padding: number,
): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.displayWidth);
    maxY = Math.max(maxY, item.y + item.displayHeight);
  }

  const padded: Bounds = {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };

  const panel: Bounds = {
    x: 0,
    y: 0,
    width: panelWidth,
    height: panelHeight,
  };

  const clipped = intersectBounds(padded, panel);
  if (!clipped) {
    // All content outside panel — fall back to a 1×1 empty crop at origin
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return clipped;
}

/**
 * Compose a high-res image matching canvas layout and z-order.
 * Crops to device content (+ padding), clipped to the visible panel.
 */
export async function exportMockup(
  items: ExportableItem[],
  panelWidth: number,
  panelHeight: number,
  options: ExportOptions,
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
      const displayHeight = displayHeightFor(
        item.displayWidth,
        nativeWidth,
        nativeHeight,
      );
      return { ...item, img, nativeWidth, nativeHeight, displayHeight };
    }),
  );

  const bounds = contentBounds(
    withNative,
    panelWidth,
    panelHeight,
    EXPORT_CONTENT_PADDING,
  );

  let maxNativeWidth = 0;
  let maxDisplayWidth = 0;
  for (const item of withNative) {
    maxNativeWidth = Math.max(maxNativeWidth, item.nativeWidth);
    maxDisplayWidth = Math.max(maxDisplayWidth, item.displayWidth);
  }

  // Best: widest device approaches native width
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
    // Never upscale past Best
    exportScale = Math.min(bestScale, presetScale);
  }

  const outW = Math.max(1, Math.round(bounds.width * exportScale));
  const outH = Math.max(1, Math.round(bounds.height * exportScale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  if (options.format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  } else {
    ctx.clearRect(0, 0, outW, outH);
  }

  for (const item of withNative) {
    const dx = (item.x - bounds.x) * exportScale;
    const dy = (item.y - bounds.y) * exportScale;
    const dw = item.displayWidth * exportScale;
    const dh = item.displayHeight * exportScale;
    ctx.drawImage(item.img, dx, dy, dw, dh);
  }

  const blob = await canvasToBlob(canvas, options.format);
  const ext = options.format === 'jpg' ? 'jpg' : 'png';
  const resLabel = options.resolution;
  return {
    blob,
    filenameHint: `mockup-${resLabel}.${ext}`,
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
