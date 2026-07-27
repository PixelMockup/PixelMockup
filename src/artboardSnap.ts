import { storageGet, storageSet } from './storage';

export const SNAP_PX = 8;
export const SNAP_ENABLED_KEY = 'pixelMockup.snapEnabled';
export const SNAP_MARGIN_KEY = 'pixelMockup.snapMargin';
const SNAP_ENABLED_LEGACY_KEY = 'mockupStudio.snapEnabled';
const SNAP_MARGIN_LEGACY_KEY = 'mockupStudio.snapMargin';
export const DEFAULT_SNAP_MARGIN = 40;
export const SNAP_MARGIN_MIN = 0;
export const SNAP_MARGIN_MAX = 200;
export const DEFAULT_ARTBOARD: ArtboardSize = { width: 1280, height: 720 };

/** Page = artboard geometry (magenta); sibling = other devices (accent). */
export type SnapGuideKind = 'page' | 'sibling';

export type SnapGuideLine = {
  pos: number;
  kind: SnapGuideKind;
};

export type SnapGuides = {
  vertical: SnapGuideLine[];
  horizontal: SnapGuideLine[];
};

export const NO_GUIDES: SnapGuides = {
  vertical: [],
  horizontal: [],
};

export type AlignMode = 'center' | 'middle' | 'bottom';

export type SizeBox = { displayWidth: number; displayHeight: number };

export type PositionedBox = SizeBox & { x: number; y: number };

export type ArtboardSize = { width: number; height: number };

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Math.round(v * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
}

/** Edges, quarters, center, optional margin insets. */
function pageTargets(size: number, margin: number): number[] {
  const targets = [
    0,
    size / 4,
    size / 2,
    (3 * size) / 4,
    size,
  ];
  if (margin > 0 && margin * 2 < size) {
    targets.push(margin, size - margin);
  }
  return uniqueSorted(targets);
}

function siblingXTargets(siblings: PositionedBox[]): number[] {
  const xs: number[] = [];
  for (const s of siblings) {
    xs.push(s.x, s.x + s.displayWidth / 2, s.x + s.displayWidth);
  }
  return uniqueSorted(xs);
}

function siblingYTargets(siblings: PositionedBox[]): number[] {
  const ys: number[] = [];
  for (const s of siblings) {
    ys.push(s.y, s.y + s.displayHeight / 2, s.y + s.displayHeight);
  }
  return uniqueSorted(ys);
}

/**
 * Prefer closer target; on equal distance prefer page over sibling.
 */
function snapAxis(
  origin: number,
  size: number,
  pageTargetsList: number[],
  siblingTargetsList: number[],
  threshold: number,
): { origin: number; guide: SnapGuideLine | null } {
  const anchors = [
    { offset: 0, pos: origin },
    { offset: size / 2, pos: origin + size / 2 },
    { offset: size, pos: origin + size },
  ];

  let bestDist = threshold + 1;
  let bestOrigin = origin;
  let bestGuide: SnapGuideLine | null = null;

  const tryTargets = (targets: number[], kind: SnapGuideKind) => {
    for (const anchor of anchors) {
      for (const target of targets) {
        const dist = Math.abs(anchor.pos - target);
        if (dist > threshold) continue;
        if (dist < bestDist) {
          bestDist = dist;
          bestOrigin = target - anchor.offset;
          bestGuide = { pos: target, kind };
        } else if (
          dist === bestDist &&
          bestGuide?.kind === 'sibling' &&
          kind === 'page'
        ) {
          bestOrigin = target - anchor.offset;
          bestGuide = { pos: target, kind: 'page' };
        }
      }
    }
  };

  // Siblings first, then page so page wins ties.
  tryTargets(siblingTargetsList, 'sibling');
  tryTargets(pageTargetsList, 'page');

  return { origin: bestOrigin, guide: bestGuide };
}

export function snapPosition(
  item: SizeBox,
  x: number,
  y: number,
  siblings: PositionedBox[] = [],
  board: ArtboardSize = DEFAULT_ARTBOARD,
  margin: number = DEFAULT_SNAP_MARGIN,
): { x: number; y: number; guides: SnapGuides } {
  const m = clampSnapMargin(margin);
  const pageX = pageTargets(board.width, m);
  const pageY = pageTargets(board.height, m);
  const sibX = siblingXTargets(siblings);
  const sibY = siblingYTargets(siblings);

  const sx = snapAxis(x, item.displayWidth, pageX, sibX, SNAP_PX);
  const sy = snapAxis(y, item.displayHeight, pageY, sibY, SNAP_PX);

  return {
    x: sx.origin,
    y: sy.origin,
    guides: {
      vertical: sx.guide != null ? [sx.guide] : [],
      horizontal: sy.guide != null ? [sy.guide] : [],
    },
  };
}

export function clampSnapMargin(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SNAP_MARGIN;
  return Math.min(SNAP_MARGIN_MAX, Math.max(SNAP_MARGIN_MIN, Math.round(value)));
}

export function readSnapMargin(): number {
  try {
    const raw = storageGet(SNAP_MARGIN_KEY, SNAP_MARGIN_LEGACY_KEY);
    if (raw == null) return DEFAULT_SNAP_MARGIN;
    return clampSnapMargin(Number(raw));
  } catch {
    return DEFAULT_SNAP_MARGIN;
  }
}

export function persistSnapMargin(margin: number) {
  try {
    const clamped = clampSnapMargin(margin);
    if (!Number.isFinite(clamped)) return;
    storageSet(SNAP_MARGIN_KEY, String(clamped));
  } catch {
    // Private / locked storage — ignore
  }
}

export function alignBox(
  item: SizeBox & { x: number; y: number },
  mode: AlignMode,
  board: ArtboardSize = DEFAULT_ARTBOARD,
): { x: number; y: number } {
  if (mode === 'center') {
    return { x: (board.width - item.displayWidth) / 2, y: item.y };
  }
  if (mode === 'middle') {
    return { x: item.x, y: (board.height - item.displayHeight) / 2 };
  }
  return { x: item.x, y: board.height - item.displayHeight };
}

/** Keep item centers; clamp into new artboard bounds. */
export function clampItemToArtboard<
  T extends { x: number; y: number; displayWidth: number; displayHeight: number },
>(item: T, board: ArtboardSize): T {
  const cx = item.x + item.displayWidth / 2;
  const cy = item.y + item.displayHeight / 2;
  let x = cx - item.displayWidth / 2;
  let y = cy - item.displayHeight / 2;
  const maxX = Math.max(0, board.width - item.displayWidth);
  const maxY = Math.max(0, board.height - item.displayHeight);
  x = Math.min(maxX, Math.max(0, x));
  y = Math.min(maxY, Math.max(0, y));
  return { ...item, x, y };
}

export function readSnapEnabled(): boolean {
  try {
    const raw = storageGet(SNAP_ENABLED_KEY, SNAP_ENABLED_LEGACY_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    // ignore
  }
  return true;
}

export function persistSnapEnabled(enabled: boolean) {
  try {
    const flag = enabled ? '1' : '0';
    if (flag === '0' || flag === '1') {
      storageSet(SNAP_ENABLED_KEY, flag);
    }
  } catch {
    // ignore
  }
}

export type ViewZoom = 'fit' | 0.5 | 1 | 1.5;

export const VIEW_ZOOM_STEPS: ViewZoom[] = ['fit', 0.5, 1, 1.5];

export function artboardWidthCss(
  zoom: ViewZoom,
  board: ArtboardSize = DEFAULT_ARTBOARD,
): string {
  const aspectFit = `calc(100cqh * ${board.width} / ${board.height})`;
  if (zoom === 'fit') {
    return `min(100cqw, ${aspectFit})`;
  }
  return `min(100cqw, ${board.width * zoom}px, ${aspectFit})`;
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
    Math.max(0, Math.max(0, i) + dir),
  );
  return VIEW_ZOOM_STEPS[next];
}
