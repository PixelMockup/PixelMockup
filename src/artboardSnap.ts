import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from './deviceScale';

export const SNAP_PX = 8;

export type SnapGuides = {
  vertical: boolean;
  horizontal: boolean;
  bottom: boolean;
};

export const NO_GUIDES: SnapGuides = {
  vertical: false,
  horizontal: false,
  bottom: false,
};

export type AlignMode = 'center' | 'middle' | 'bottom';

export type SizeBox = { displayWidth: number; displayHeight: number };

export function snapPosition(
  item: SizeBox,
  x: number,
  y: number,
): { x: number; y: number; guides: SnapGuides } {
  let nx = x;
  let ny = y;
  const guides: SnapGuides = { ...NO_GUIDES };

  const centerX = ARTBOARD_WIDTH / 2;
  const centerY = ARTBOARD_HEIGHT / 2;
  const itemCx = x + item.displayWidth / 2;
  const itemCy = y + item.displayHeight / 2;
  const itemBottom = y + item.displayHeight;

  if (Math.abs(itemCx - centerX) <= SNAP_PX) {
    nx = centerX - item.displayWidth / 2;
    guides.vertical = true;
  }
  if (Math.abs(itemCy - centerY) <= SNAP_PX) {
    ny = centerY - item.displayHeight / 2;
    guides.horizontal = true;
  }
  if (Math.abs(itemBottom - ARTBOARD_HEIGHT) <= SNAP_PX) {
    ny = ARTBOARD_HEIGHT - item.displayHeight;
    guides.bottom = true;
  }

  return { x: nx, y: ny, guides };
}

export function alignBox(
  item: SizeBox & { x: number; y: number },
  mode: AlignMode,
): { x: number; y: number } {
  if (mode === 'center') {
    return { x: (ARTBOARD_WIDTH - item.displayWidth) / 2, y: item.y };
  }
  if (mode === 'middle') {
    return { x: item.x, y: (ARTBOARD_HEIGHT - item.displayHeight) / 2 };
  }
  return { x: item.x, y: ARTBOARD_HEIGHT - item.displayHeight };
}

export type ViewZoom = 'fit' | 0.5 | 1 | 1.5;

export const VIEW_ZOOM_STEPS: ViewZoom[] = ['fit', 0.5, 1, 1.5];

export function artboardWidthCss(zoom: ViewZoom): string {
  const aspectFit = `calc(100cqh * ${ARTBOARD_WIDTH} / ${ARTBOARD_HEIGHT})`;
  if (zoom === 'fit') {
    return `min(100cqw, ${aspectFit})`;
  }
  return `min(100cqw, ${ARTBOARD_WIDTH * zoom}px, ${aspectFit})`;
}

export function viewZoomLabel(zoom: ViewZoom): string {
  if (zoom === 'fit') return 'Fit';
  if (zoom === 0.5) return '50%';
  if (zoom === 1) return '100%';
  return '150%';
}

export function stepViewZoom(current: ViewZoom, dir: -1 | 1): ViewZoom {
  const i = VIEW_ZOOM_STEPS.indexOf(current);
  const next = Math.min(
    VIEW_ZOOM_STEPS.length - 1,
    Math.max(0, (i < 0 ? 0 : i) + dir),
  );
  return VIEW_ZOOM_STEPS[next];
}
