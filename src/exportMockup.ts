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

/**
 * Compose a high-res image matching the fixed artboard (WYSIWYG).
 * Frame is always ARTBOARD_WIDTH × ARTBOARD_HEIGHT logical units.
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
      const displayHeight = displayHeightFor(
        item.displayWidth,
        nativeWidth,
        nativeHeight,
      );
      return { ...item, img, nativeWidth, nativeHeight, displayHeight };
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

  // Clip to artboard (matches overflow: hidden)
  ctx.beginPath();
  ctx.rect(0, 0, outW, outH);
  ctx.clip();

  for (const item of withNative) {
    const dx = item.x * exportScale;
    const dy = item.y * exportScale;
    const dw = item.displayWidth * exportScale;
    const dh = item.displayHeight * exportScale;
    ctx.drawImage(item.img, dx, dy, dw, dh);
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
