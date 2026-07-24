import type { DeviceItem } from './App';

/** One device slot — positions are normalized to artboard (0–1). */
export interface LayoutPresetItem {
  /** Catalog key, e.g. `phones/Apple iPhone 11 Pro Max Space Grey.svg` */
  catalogFile: string;
  /** Left edge as fraction of artboard width (ignored if centerX) */
  nx?: number;
  /** Gap from bottom as fraction of artboard height (ignored if centerY) */
  nBottom?: number;
  /** Center on artboard after size is known */
  centerX?: boolean;
  centerY?: boolean;
  /** Extra scale on top of global Size preset (default 1) */
  localScale?: number;
  /** Draw order (higher = in front) */
  zIndex?: number;
}

export interface LayoutPreset {
  id: string;
  label: string;
  items: LayoutPresetItem[];
}

/**
 * Layout presets use normalized coords so they re-anchor on any canvas format.
 * Tuned for Size 1×; localScale fine-tunes relative device size.
 */
export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: 'apple-lineup',
    label: 'Apple lineup',
    // Layered: iMac back (center), iPad left + MacBook right mid, iPhone front.
    items: [
      {
        catalogFile: 'computers/Apple iMac.svg',
        nx: 0.3091,
        nBottom: 0.0889,
        localScale: 1.35,
        zIndex: 0,
      },
      {
        catalogFile:
          'tablets/Apple iPad Pro 13-inch Space Gray - Landscape-2.svg',
        nx: 0.211,
        nBottom: 0.0889,
        localScale: 1.45,
        zIndex: 1,
      },
      {
        catalogFile: 'computers/Apple MacBook Pro 15-inch Space Grey.svg',
        nx: 0.5697,
        nBottom: 0.0889,
        localScale: 1.35,
        zIndex: 1,
      },
      {
        catalogFile: 'phones/Apple iPhone 11 Pro Max Space Grey.svg',
        nx: 0.4018,
        nBottom: 0.0889,
        localScale: 1.55,
        zIndex: 2,
      },
    ],
  },
  {
    id: 'color-fan',
    label: 'Color fan',
    // Size ladder: Pro → 11 → Pro Max, shared baseline, even gaps.
    items: [
      {
        catalogFile: 'phones/Apple iPhone 11 Pro Space Grey.svg',
        nx: 0.33,
        nBottom: 0.12,
        localScale: 2.2,
        zIndex: 0,
      },
      {
        catalogFile: 'phones/Apple iPhone 11 Black.svg',
        nx: 0.45,
        nBottom: 0.12,
        localScale: 2.2,
        zIndex: 1,
      },
      {
        catalogFile: 'phones/Apple iPhone 11 Pro Max Space Grey.svg',
        nx: 0.575,
        nBottom: 0.12,
        localScale: 2.2,
        zIndex: 2,
      },
    ],
  },
  {
    id: 'creator-desk',
    label: 'Creator desk',
    // Display frontmost; MacBook + phone tucked behind bottom corners.
    items: [
      {
        catalogFile: 'computers/Apple MacBook Pro 15-inch Space Grey.svg',
        nx: 0.14,
        nBottom: 0.08,
        localScale: 1.05,
        zIndex: 0,
      },
      {
        catalogFile: 'phones/Apple iPhone 11 Pro Max Space Grey.svg',
        nx: 0.72,
        nBottom: 0.04,
        localScale: 1.3,
        zIndex: 1,
      },
      {
        catalogFile: 'displays/Apple Pro Display XDR.svg',
        centerX: true,
        nBottom: 0.16,
        localScale: 1.2,
        zIndex: 2,
      },
    ],
  },
  {
    id: 'pocket-trio',
    label: 'Pocket trio',
    // iPad+Pencil back; phone flush bottom-left; watch on phone right edge front.
    items: [
      {
        catalogFile:
          'tablets/Apple iPad Pro 13-inch Space Gray - Portrait-2.svg',
        nx: 0.3,
        nBottom: 0.1,
        localScale: 1.3,
        zIndex: 0,
      },
      {
        catalogFile: 'phones/Apple iPhone 11 Pro Max Space Grey.svg',
        nx: 0.18,
        nBottom: 0.1,
        localScale: 1.35,
        zIndex: 1,
      },
      {
        catalogFile:
          'watches/Apple Watch 44mm Space Grey Aluminum + Black Closed.svg',
        nx: 0.34,
        nBottom: 0.04,
        localScale: 1.9,
        zIndex: 2,
      },
    ],
  },
] as const;

export function getLayoutPreset(id: string): LayoutPreset | undefined {
  return LAYOUT_PRESETS.find((p) => p.id === id);
}

export function resolveSlotPosition(
  slot: LayoutPresetItem,
  displayWidth: number,
  displayHeight: number,
  artboardW: number,
  artboardH: number,
): { x: number; y: number } {
  let x = (slot.nx ?? 0) * artboardW;
  let y = artboardH - displayHeight - (slot.nBottom ?? 0) * artboardH;
  if (slot.centerX) {
    x = (artboardW - displayWidth) / 2;
  }
  if (slot.centerY) {
    y = (artboardH - displayHeight) / 2;
  }
  return { x, y };
}

/** Flat index of library devices by catalogFile. */
export function indexLibraryByCatalog(
  groupedLibrary: Record<string, DeviceItem[]>,
): Map<string, DeviceItem> {
  const map = new Map<string, DeviceItem>();
  for (const items of Object.values(groupedLibrary)) {
    for (const item of items) {
      map.set(item.catalogFile, item);
    }
  }
  return map;
}

export function resolvePresetDevices(
  preset: LayoutPreset,
  byCatalog: Map<string, DeviceItem>,
): { item: DeviceItem; slot: LayoutPresetItem }[] {
  const resolved: { item: DeviceItem; slot: LayoutPresetItem }[] = [];
  for (const slot of preset.items) {
    const device = byCatalog.get(slot.catalogFile);
    if (!device) {
      console.warn(
        `[Pixel Mockup] Preset "${preset.id}" missing asset: ${slot.catalogFile}`,
      );
      continue;
    }
    resolved.push({ item: device, slot });
  }
  return resolved;
}
