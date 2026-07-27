export function clientToLogical(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  boardW: number,
  boardH: number,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * boardW,
    y: ((clientY - rect.top) / rect.height) * boardH,
  };
}
