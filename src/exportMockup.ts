import {
  displayHeightFor,
  EXPORT_MAX_EDGE,
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create PNG blob'));
      },
      'image/png',
    );
  });
}

/**
 * Compose a high-res PNG matching canvas layout and z-order.
 * Clips to the visible canvas panel (WYSIWYG with overflow:hidden).
 */
export async function exportMockupPng(
  items: ExportableItem[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<Blob> {
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

  let maxNativeWidth = 0;
  let maxDisplayWidth = 0;
  for (const item of withNative) {
    maxNativeWidth = Math.max(maxNativeWidth, item.nativeWidth);
    maxDisplayWidth = Math.max(maxDisplayWidth, item.displayWidth);
  }

  // Scale so the widest device approaches its native width; never upscale past source.
  let exportScale =
    maxDisplayWidth > 0 ? maxNativeWidth / maxDisplayWidth : 1;

  const unclampedW = canvasWidth * exportScale;
  const unclampedH = canvasHeight * exportScale;
  const longest = Math.max(unclampedW, unclampedH);
  if (longest > EXPORT_MAX_EDGE) {
    exportScale *= EXPORT_MAX_EDGE / longest;
  }

  const outW = Math.max(1, Math.round(canvasWidth * exportScale));
  const outH = Math.max(1, Math.round(canvasHeight * exportScale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Transparent background — matches studio panel
  ctx.clearRect(0, 0, outW, outH);

  // Clip to canvas bounds (matches overflow: hidden)
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

  return canvasToBlob(canvas);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
