/**
 * Cover-scale factor so a source fills a destination (object-fit: cover).
 * Shared by screen crop math and website viewport helpers.
 */
export function coverScale(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): number {
  const sw = Math.max(1, srcWidth);
  const sh = Math.max(1, srcHeight);
  const dw = Math.max(1, dstWidth);
  const dh = Math.max(1, dstHeight);
  return Math.max(dw / sw, dh / sh);
}
