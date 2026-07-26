import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { DeviceItem } from './App';
import {
  applySizeScale,
  CATEGORY_ORDER,
  displayHeightForContent,
  displaySizeFromMm,
  getArtboardFormat,
  getSizeScalePreset,
  persistArtboardFormatId,
  persistSizeScaleId,
  readStoredArtboardFormatId,
  readStoredSizeScaleId,
  type ArtboardFormatId,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import {
  alignBox,
  artboardWidthCss,
  clampItemToArtboard,
  NO_GUIDES,
  persistSnapEnabled,
  readSnapEnabled,
  readSnapMargin,
  snapPosition,
  stepViewZoom,
  viewZoomLabel,
  type AlignMode,
  type SnapGuides,
  type ViewZoom,
} from './artboardSnap';
import { pulseSnapHaptic, snapGuidesLatchKey } from './snapHaptics';
import {
  bringForwardItems,
  bringToFrontItems,
  byZ,
  pushBackwardItems,
  reindexZ,
  selectedZRank,
  sendToBackItems,
} from './canvasZOrder';
import { downloadBlob, exportMockup, type ExportBgMode } from './exportMockup';
import {
  clampScreenPan,
  clampScreenZoom,
  getDeviceScreenInfo,
  getPunchedDeviceSrc,
  screenObjectPosition,
} from './deviceScreenBounds';
import {
  getCatalogScreenRect,
  screenClipInsetCss,
  type DeviceScreenRect,
} from './deviceScreens';
import {
  getImageContentBounds,
  type ContentBounds,
} from './imageContentBounds';
import { loadNativeSize } from './loadImage';
import {
  captureWebsiteScreenshotsCached,
  clearWebsiteCaptureCache,
  describeCaptureError,
} from './captureWebsite';
import {
  getWebsiteViewport,
  normalizeWebsiteUrl,
  websiteHostname,
} from './websiteUrl';
import WebsiteScreen from './WebsiteScreen';
import EmptyHero from './EmptyHero';
import IconRail from './IconRail';
import SelectionInspector from './SelectionInspector';
import TopCommandBar from './TopCommandBar';
import {
  getLayoutPreset,
  indexLibraryByCatalog,
  resolvePresetDevices,
  resolveSlotPosition,
} from './layoutPresets';
import KeybindingsPanel from './KeybindingsPanel';
import ContextMenu, { type ContextMenuState } from './ContextMenu';
import LibraryPanel, {
  LIBRARY_DRAG_MIME,
  LIBRARY_W_MAX,
  LIBRARY_W_MIN,
} from './LibraryPanel';
import {
  formatDeviceDisplayName,
  matchesSearchQuery,
  sortBySearchRelevance,
} from './deviceMeta';
import {
  detectPlatform,
  isMacPlatform,
  loadBindingsForPlatform,
  type BindingMap,
} from './keybindings';
import { storageGet, storageSet } from './storage';
import { useKeybindings } from './useKeybindings';
import { useTheme } from './useTheme';

const LIBRARY_W_KEY = 'pixelMockup.libraryWidth';
const LIBRARY_W_LEGACY_KEY = 'mockupStudio.libraryWidth';
const LIBRARY_W_DEFAULT = 320;
const LIBRARY_COLLAPSED_KEY = 'pixelMockup.libraryCollapsed';
const LIBRARY_COLLAPSED_LEGACY_KEY = 'mockupStudio.libraryCollapsed';

function readLibraryCollapsed(): boolean {
  try {
    const raw = storageGet(LIBRARY_COLLAPSED_KEY, LIBRARY_COLLAPSED_LEGACY_KEY);
    if (raw === '0') return false;
    return true;
  } catch {
    return true;
  }
}

function persistLibraryCollapsed(collapsed: boolean) {
  try {
    storageSet(LIBRARY_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // ignore
  }
}

interface MockupStudioProps {
  groupedLibrary: Record<string, DeviceItem[]>;
}

interface CanvasItem extends DeviceItem {
  instanceId: string;
  x: number;
  y: number;
  zIndex: number;
  displayWidth: number;
  displayHeight: number;
  nativeWidth: number;
  nativeHeight: number;
  /** Opaque crop in native pixels; selection/export hug the device. */
  contentBounds: ContentBounds;
  /** User image shown on the device screen (data URL). */
  screenImageSrc: string | null;
  /** Screen rect in native device pixels (same space as `contentBounds`). */
  screenBounds: ContentBounds | null;
  /** Screen corner radius in native pixels (from deviceScreens.json). */
  screenRx: number;
  /** Device frame with a transparent screen, used while a screen image is set. */
  punchedSrc: string | null;
  /** Screen image pan (-1…1) and zoom (1…4). */
  screenPanX: number;
  screenPanY: number;
  screenZoom: number;
}

/** Snapshot for in-memory copy/paste (relative offsets from selection origin). */
type ClipboardPayload = {
  items: Array<
    Omit<CanvasItem, 'instanceId' | 'zIndex' | 'x' | 'y'> & {
      offsetX: number;
      offsetY: number;
    }
  >;
};

function contentCropImgStyle(
  bounds: ContentBounds,
  nativeWidth: number,
  nativeHeight: number,
): CSSProperties {
  const w = Math.max(1, bounds.width);
  const h = Math.max(1, bounds.height);
  return {
    width: `${(nativeWidth / w) * 100}%`,
    height: `${(nativeHeight / h) * 100}%`,
    left: `${(-bounds.x / w) * 100}%`,
    top: `${(-bounds.y / h) * 100}%`,
  };
}

/** Screen rect positioned relative to the visible (content-cropped) frame. */
function screenLayerStyle(
  screen: ContentBounds,
  content: ContentBounds,
): CSSProperties {
  const w = Math.max(1, content.width);
  const h = Math.max(1, content.height);
  return {
    left: `${((screen.x - content.x) / w) * 100}%`,
    top: `${((screen.y - content.y) / h) * 100}%`,
    width: `${(screen.width / w) * 100}%`,
    height: `${(screen.height / h) * 100}%`,
  };
}

/** Prefer item metadata, else catalog map. */
function resolveItemScreen(item: {
  catalogFile: string;
  screenBounds: ContentBounds | null;
  screenRx: number;
}): DeviceScreenRect | null {
  if (item.screenBounds) {
    return { ...item.screenBounds, rx: item.screenRx };
  }
  return getCatalogScreenRect(item.catalogFile);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function clientToLogical(
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

function readLibraryWidth(): number {
  try {
    const n = Number(storageGet(LIBRARY_W_KEY, LIBRARY_W_LEGACY_KEY));
    if (Number.isFinite(n)) {
      return Math.min(LIBRARY_W_MAX, Math.max(LIBRARY_W_MIN, n));
    }
  } catch {
    // ignore
  }
  return LIBRARY_W_DEFAULT;
}

function persistLibraryWidth(w: number) {
  try {
    storageSet(LIBRARY_W_KEY, String(w));
  } catch {
    // ignore
  }
}

export default function MockupStudio({ groupedLibrary }: MockupStudioProps) {
  const platform = useMemo(() => detectPlatform(), []);
  const { theme, toggleTheme } = useTheme();
  const [bindings, setBindings] = useState<BindingMap>(() =>
    loadBindingsForPlatform(platform),
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [libraryWidth, setLibraryWidth] = useState(readLibraryWidth);
  const [viewZoom, setViewZoom] = useState<ViewZoom>('fit');
  const [snapGuides, setSnapGuides] = useState<SnapGuides>(NO_GUIDES);
  const [snapEnabled, setSnapEnabled] = useState(readSnapEnabled);
  const [snapMargin] = useState(readSnapMargin);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [layoutsMenuOpen, setLayoutsMenuOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(readLibraryCollapsed);
  const [placingPath, setPlacingPath] = useState<string | null>(null);
  const [layerHint, setLayerHint] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** Global website shown on all devices without a per-device screen image. */
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [websiteUrlDraft, setWebsiteUrlDraft] = useState('');
  const [capturingHint, setCapturingHint] = useState<string | null>(null);
  const [softEmptyDownload, setSoftEmptyDownload] = useState(false);

  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  /** Last id is primary (context / layer target). */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState({
    id: null as string | null,
    offsetX: 0,
    offsetY: 0,
    /** Instance ids moved together on drag. */
    groupIds: [] as string[],
    /** Origins at pointer-down for group members. */
    origins: {} as Record<string, { x: number; y: number }>,
  });
  /** Pan the screen image (not the device) when dragging the screen rect. */
  const [screenDrag, setScreenDrag] = useState<{
    id: string;
    lastX: number;
    lastY: number;
    screenW: number;
    screenH: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const [clipboardRev, setClipboardRev] = useState(0);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [categoryFilter, setCategoryFilter] = useState<string | null>('phones');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportResolution, setExportResolution] =
    useState<ExportResolution>('best');
  const [exportBgMode, setExportBgMode] = useState<ExportBgMode>('transparent');
  const [exportBgColor] = useState('#ffffff');
  const [exportBgImageSrc] = useState<string | null>(null);
  const [sizeScaleId, setSizeScaleId] = useState<SizeScaleId>(
    readStoredSizeScaleId,
  );
  const [artboardFormatId, setArtboardFormatId] = useState<ArtboardFormatId>(
    readStoredArtboardFormatId,
  );

  const artboard = useMemo(
    () => getArtboardFormat(artboardFormatId),
    [artboardFormatId],
  );
  const artboardW = artboard.width;
  const artboardH = artboard.height;

  const canvasRef = useRef<HTMLDivElement>(null);
  const screenFileInputRef = useRef<HTMLInputElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const layoutsMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(
    null,
  );
  const statusTimer = useRef<number | null>(null);
  const lastSnapLatchKey = useRef('');
  const undoStackRef = useRef<CanvasItem[][]>([]);
  const canvasItemsRef = useRef(canvasItems);
  canvasItemsRef.current = canvasItems;

  const pushUndo = () => {
    const snapshot = canvasItemsRef.current.map((item) => ({ ...item }));
    undoStackRef.current = [...undoStackRef.current.slice(-29), snapshot];
  };

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) {
      announce('Nothing to undo');
      return;
    }
    setCanvasItems(prev);
    setSelectedIds([]);
    announce('Undone');
  };

  const announce = (msg: string) => {
    setStatusMessage(msg);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatusMessage(null), 1600);
  };

  const categories = useMemo(() => {
    const present = new Set(Object.keys(groupedLibrary));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = Object.keys(groupedLibrary)
      .filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number]))
      .sort();
    return [...ordered, ...extras];
  }, [groupedLibrary]);

  const effectiveCategory =
    categoryFilter && categories.includes(categoryFilter)
      ? categoryFilter
      : (categories[0] ?? null);

  useEffect(() => {
    if (categories.length === 0) {
      if (categoryFilter != null) setCategoryFilter(null);
      return;
    }
    if (categoryFilter == null || !categories.includes(categoryFilter)) {
      const phones = categories.find((c) => c.toLowerCase() === 'phones');
      setCategoryFilter(phones ?? categories[0]);
    }
  }, [categories, categoryFilter]);

  const categoryDevices = useMemo(() => {
    if (!effectiveCategory) return [] as DeviceItem[];
    return groupedLibrary[effectiveCategory] ?? [];
  }, [groupedLibrary, effectiveCategory]);

  const searchIsGlobal = searchQuery.trim().length > 0;

  const searchPool = useMemo(() => {
    if (!searchIsGlobal) return categoryDevices;
    return Object.values(groupedLibrary).flat();
  }, [searchIsGlobal, categoryDevices, groupedLibrary]);

  const availableBrands = useMemo(() => {
    const set = new Set(searchPool.map((d) => d.brand));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [searchPool]);

  const brandAll =
    selectedBrand == null || !availableBrands.includes(selectedBrand);

  const brandFilteredDevices = useMemo(() => {
    if (brandAll) return searchPool;
    return searchPool.filter((d) => d.brand === selectedBrand);
  }, [searchPool, brandAll, selectedBrand]);

  const availableProducts = useMemo(() => {
    const set = new Set(brandFilteredDevices.map((d) => d.productFamily));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [brandFilteredDevices]);

  const selectedProductValid =
    selectedProduct != null && availableProducts.includes(selectedProduct)
      ? selectedProduct
      : null;

  useEffect(() => {
    if (selectedBrand != null && !availableBrands.includes(selectedBrand)) {
      setSelectedBrand(null);
      setSelectedProduct(null);
    }
  }, [availableBrands, selectedBrand]);

  useEffect(() => {
    if (
      selectedProduct != null &&
      !availableProducts.includes(selectedProduct)
    ) {
      setSelectedProduct(null);
    }
  }, [availableProducts, selectedProduct]);

  const filteredLibrary = useMemo(() => {
    let items = brandFilteredDevices.filter((item) => {
      if (
        selectedProductValid != null &&
        item.productFamily !== selectedProductValid
      ) {
        return false;
      }
      return matchesSearchQuery(item, searchQuery);
    });
    items = sortBySearchRelevance(items, searchQuery);
    if (items.length === 0) return [];

    if (searchIsGlobal) {
      const byCat = new Map<string, DeviceItem[]>();
      for (const item of items) {
        const list = byCat.get(item.category) ?? [];
        list.push(item);
        byCat.set(item.category, list);
      }
      const ordered = [
        ...CATEGORY_ORDER.filter((c) => byCat.has(c)),
        ...[...byCat.keys()].filter(
          (c) => !(CATEGORY_ORDER as readonly string[]).includes(c),
        ),
      ];
      return ordered.map((category) => ({
        category,
        items: byCat.get(category)!,
      }));
    }

    if (!effectiveCategory) return [];
    return [{ category: effectiveCategory, items }];
  }, [
    brandFilteredDevices,
    selectedProductValid,
    searchQuery,
    searchIsGlobal,
    effectiveCategory,
  ]);

  const primaryId =
    selectedIds.length > 0 ? selectedIds[selectedIds.length - 1]! : null;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSelection = selectedIds.length > 0;
  const selectionHasScreenImage = useMemo(
    () =>
      canvasItems.some(
        (i) => selectedIdSet.has(i.instanceId) && i.screenImageSrc != null,
      ),
    [canvasItems, selectedIdSet],
  );

  const zRank = useMemo(
    () => selectedZRank(canvasItems, primaryId),
    [canvasItems, primaryId],
  );
  const canBringForward =
    primaryId != null && zRank.index >= 0 && zRank.index < zRank.max;
  const canPushBackward = primaryId != null && zRank.index > 0;
  const canBringToFront = canBringForward;
  const canSendToBack = canPushBackward;

  const libraryByCatalog = useMemo(
    () => indexLibraryByCatalog(groupedLibrary),
    [groupedLibrary],
  );

  const buildCanvasItem = async (
    item: DeviceItem,
    opts: {
      x: number;
      y: number;
      zIndex: number;
      localScale?: number;
    },
  ): Promise<CanvasItem> => {
    let nativeWidth = 100;
    let nativeHeight = 200;
    try {
      const size = await loadNativeSize(item.src);
      nativeWidth = size.width;
      nativeHeight = size.height;
    } catch {
      // fallback
    }

    let contentBounds: ContentBounds = {
      x: 0,
      y: 0,
      width: nativeWidth,
      height: nativeHeight,
    };
    try {
      contentBounds = await getImageContentBounds(item.src);
    } catch {
      // fallback = full image
    }

    const { displayWidth: mmWidth, displayHeight: mmHeight } =
      displaySizeFromMm(item.widthMm, item.heightMm, {
        name: item.name,
        category: item.category,
        nativeWidth,
        nativeHeight,
      });
    const contentHeight = displayHeightForContent(
      mmWidth,
      contentBounds.width,
      contentBounds.height,
      mmHeight,
    );
    const globalFactor = getSizeScalePreset(sizeScaleId).factor;
    const local = opts.localScale ?? 1;
    const { displayWidth, displayHeight } = applySizeScale(
      mmWidth,
      contentHeight,
      globalFactor * local,
    );

    return {
      ...item,
      instanceId: crypto.randomUUID(),
      x: opts.x,
      y: opts.y,
      zIndex: opts.zIndex,
      displayWidth,
      displayHeight,
      nativeWidth,
      nativeHeight,
      contentBounds,
      screenImageSrc: null,
      screenBounds: null,
      screenRx: 0,
      punchedSrc: null,
      screenPanX: 0,
      screenPanY: 0,
      screenZoom: 1,
    };
  };

  const handleAddAndSelect = async (
    item: DeviceItem,
    at?: { x: number; y: number },
  ) => {
    setPlacingPath(item.path);
    try {
      const probe = await buildCanvasItem(item, {
        x: 0,
        y: 0,
        zIndex: canvasItemsRef.current.length,
      });
      const x = at
        ? at.x - probe.displayWidth / 2
        : Math.max(0, (artboardW - probe.displayWidth) / 2);
      const y = at
        ? at.y - probe.displayHeight / 2
        : Math.max(0, (artboardH - probe.displayHeight) / 2);
      const canvasItem = clampItemToArtboard(
        { ...probe, x, y },
        { width: artboardW, height: artboardH },
      );
      pushUndo();
      setCanvasItems((prev) => [...prev, canvasItem]);
      setSelectedIds([canvasItem.instanceId]);
      announce(`Added ${formatDeviceDisplayName(item.name)}`);
      setLibraryCollapsed(true);
      persistLibraryCollapsed(true);
    } finally {
      setPlacingPath(null);
    }
  };

  const applyLayoutPreset = async (presetId: string): Promise<boolean> => {
    const preset = getLayoutPreset(presetId);
    if (!preset) return false;
    if (canvasItemsRef.current.length > 0) {
      const ok = window.confirm(
        `Replace the artboard with “${preset.label}”? This cannot be undone from the preset itself — use Undo after if needed.`,
      );
      if (!ok) return false;
    }
    setPlacingPath(preset.id);
    try {
      const resolved = resolvePresetDevices(preset, libraryByCatalog);
      if (resolved.length === 0) {
        announce('Preset assets are missing from the library.');
        return false;
      }
      const placed: CanvasItem[] = [];
      for (let i = 0; i < resolved.length; i++) {
        const { item, slot } = resolved[i];
        const probe = await buildCanvasItem(item, {
          x: 0,
          y: 0,
          zIndex: slot.zIndex ?? i,
          localScale: slot.localScale,
        });
        const { x, y } = resolveSlotPosition(
          slot,
          probe.displayWidth,
          probe.displayHeight,
          artboardW,
          artboardH,
        );
        placed.push({
          ...probe,
          x,
          y,
          zIndex: slot.zIndex ?? i,
        });
      }
      pushUndo();
      setCanvasItems(reindexZ(byZ(placed)));
      setSelectedIds([]);
      setLibraryCollapsed(true);
      persistLibraryCollapsed(true);
      announce(`Applied ${preset.label}`);
      return true;
    } finally {
      setPlacingPath(null);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const logical = clientToLogical(
      e.clientX,
      e.clientY,
      rect,
      artboardW,
      artboardH,
    );
    const mac = isMacPlatform(platform);
    const mod = mac ? e.metaKey : e.ctrlKey;

    let nextSelected = selectedIdsRef.current;
    if (mod) {
      if (nextSelected.includes(item.instanceId)) {
        nextSelected = nextSelected.filter((id) => id !== item.instanceId);
      } else {
        nextSelected = [...nextSelected, item.instanceId];
      }
      setSelectedIds(nextSelected);
      return;
    }
    if (e.shiftKey && nextSelected.length > 0) {
      const sorted = byZ(canvasItemsRef.current);
      const primary = nextSelected[nextSelected.length - 1]!;
      const a = sorted.findIndex((i) => i.instanceId === primary);
      const b = sorted.findIndex((i) => i.instanceId === item.instanceId);
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const range = sorted.slice(lo, hi + 1).map((i) => i.instanceId);
        nextSelected = [
          ...range.filter((id) => id !== item.instanceId),
          item.instanceId,
        ];
        setSelectedIds(nextSelected);
        return;
      }
    }

    if (!nextSelected.includes(item.instanceId)) {
      nextSelected = [item.instanceId];
      setSelectedIds(nextSelected);
    }

    const groupIds = nextSelected.includes(item.instanceId)
      ? [...nextSelected]
      : [item.instanceId];
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of groupIds) {
      const found = canvasItemsRef.current.find((i) => i.instanceId === id);
      if (found) origins[id] = { x: found.x, y: found.y };
    }
    setDragInfo({
      id: item.instanceId,
      offsetX: logical.x - item.x,
      offsetY: logical.y - item.y,
      groupIds,
      origins,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (screenDrag) {
      const dx = e.clientX - screenDrag.lastX;
      const dy = e.clientY - screenDrag.lastY;
      if (dx === 0 && dy === 0) return;
      // Dragging the image right reveals content on the left → decrease pan.
      const dPanX = (-2 * dx) / screenDrag.screenW;
      const dPanY = (-2 * dy) / screenDrag.screenH;
      setScreenDrag({
        ...screenDrag,
        lastX: e.clientX,
        lastY: e.clientY,
      });
      setCanvasItems((prev) =>
        prev.map((item) =>
          item.instanceId === screenDrag.id
            ? {
                ...item,
                screenPanX: clampScreenPan(item.screenPanX + dPanX),
                screenPanY: clampScreenPan(item.screenPanY + dPanY),
              }
            : item,
        ),
      );
      return;
    }
    if (!dragInfo.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const logical = clientToLogical(
      e.clientX,
      e.clientY,
      rect,
      artboardW,
      artboardH,
    );
    const primary = canvasItems.find((i) => i.instanceId === dragInfo.id);
    if (!primary) return;
    const rawX = logical.x - dragInfo.offsetX;
    const rawY = logical.y - dragInfo.offsetY;
    const originPrimary = dragInfo.origins[dragInfo.id] ?? {
      x: primary.x,
      y: primary.y,
    };
    const dx = rawX - originPrimary.x;
    const dy = rawY - originPrimary.y;
    const groupSet = new Set(dragInfo.groupIds);

    if (!snapEnabled) {
      setSnapGuides(NO_GUIDES);
      lastSnapLatchKey.current = '';
      setCanvasItems((prev) =>
        prev.map((item) => {
          if (!groupSet.has(item.instanceId)) return item;
          const o = dragInfo.origins[item.instanceId];
          if (!o) return item;
          return { ...item, x: o.x + dx, y: o.y + dy };
        }),
      );
      return;
    }

    const siblings = canvasItems
      .filter((i) => !groupSet.has(i.instanceId))
      .map((i) => ({
        x: i.x,
        y: i.y,
        displayWidth: i.displayWidth,
        displayHeight: i.displayHeight,
      }));
    const proposedPrimary = {
      ...primary,
      x: originPrimary.x + dx,
      y: originPrimary.y + dy,
    };
    const { x, y, guides } = snapPosition(
      proposedPrimary,
      proposedPrimary.x,
      proposedPrimary.y,
      siblings,
      {
        width: artboardW,
        height: artboardH,
      },
      snapMargin,
    );
    const snapDx = x - originPrimary.x;
    const snapDy = y - originPrimary.y;
    const latchKey = snapGuidesLatchKey(guides);
    if (latchKey && latchKey !== lastSnapLatchKey.current) {
      pulseSnapHaptic();
    }
    lastSnapLatchKey.current = latchKey;
    setSnapGuides(guides);
    setCanvasItems((prev) =>
      prev.map((item) => {
        if (!groupSet.has(item.instanceId)) return item;
        const o = dragInfo.origins[item.instanceId];
        if (!o) return item;
        return { ...item, x: o.x + snapDx, y: o.y + snapDy };
      }),
    );
  };

  const handlePointerUp = () => {
    setScreenDrag(null);
    setDragInfo({
      id: null,
      offsetX: 0,
      offsetY: 0,
      groupIds: [],
      origins: {},
    });
    setSnapGuides(NO_GUIDES);
    lastSnapLatchKey.current = '';
  };

  const tryLayerAction = (kind: 'forward' | 'back') => {
    if (canvasItems.length < 2) {
      setLayerHint('Add another device to change layer order.');
      return;
    }
    if (kind === 'forward') {
      if (!canBringForward || !primaryId) return;
      pushUndo();
      setCanvasItems((prev) => bringForwardItems(prev, primaryId) ?? prev);
    } else {
      if (!canPushBackward || !primaryId) return;
      pushUndo();
      setCanvasItems((prev) => pushBackwardItems(prev, primaryId) ?? prev);
    }
  };

  const bringForward = () => tryLayerAction('forward');
  const pushBackward = () => tryLayerAction('back');

  const changeSizeScale = (nextId: SizeScaleId) => {
    if (nextId === sizeScaleId) return;
    const oldFactor = getSizeScalePreset(sizeScaleId).factor;
    const newFactor = getSizeScalePreset(nextId).factor;
    const ratio = newFactor / oldFactor;
    setSizeScaleId(nextId);
    persistSizeScaleId(nextId);
    pushUndo();
    setCanvasItems((prev) =>
      prev.map((item) => {
        const displayWidth = item.displayWidth * ratio;
        const displayHeight = item.displayHeight * ratio;
        const cx = item.x + item.displayWidth / 2;
        const cy = item.y + item.displayHeight / 2;
        return {
          ...item,
          displayWidth,
          displayHeight,
          x: cx - displayWidth / 2,
          y: cy - displayHeight / 2,
        };
      }),
    );
    announce(`Size ${getSizeScalePreset(nextId).label}`);
  };

  const toggleSnap = () => {
    const next = !snapEnabled;
    setSnapEnabled(next);
    persistSnapEnabled(next);
    if (!next) setSnapGuides(NO_GUIDES);
    announce(next ? 'Snap on' : 'Snap off');
  };

  const changeArtboardFormat = (nextId: ArtboardFormatId) => {
    if (nextId === artboardFormatId) return;
    const next = getArtboardFormat(nextId);
    setArtboardFormatId(nextId);
    persistArtboardFormatId(nextId);
    setCanvasItems((prev) =>
      prev.map((item) =>
        clampItemToArtboard(item, {
          width: next.width,
          height: next.height,
        }),
      ),
    );
    setSnapGuides(NO_GUIDES);
    announce(`Canvas ${next.label}`);
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const remove = new Set(selectedIds);
    pushUndo();
    setCanvasItems((prev) =>
      reindexZ(byZ(prev.filter((item) => !remove.has(item.instanceId)))),
    );
    setSelectedIds([]);
  };

  const bringToFront = () => {
    if (!primaryId) return;
    pushUndo();
    setCanvasItems((prev) => bringToFrontItems(prev, primaryId) ?? prev);
  };

  const sendToBack = () => {
    if (!primaryId) return;
    pushUndo();
    setCanvasItems((prev) => sendToBackItems(prev, primaryId) ?? prev);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    setCanvasItems((prev) =>
      prev.map((item) => {
        if (!ids.has(item.instanceId)) return item;
        return clampItemToArtboard(
          { ...item, x: item.x + dx, y: item.y + dy },
          { width: artboardW, height: artboardH },
        );
      }),
    );
  };

  const alignSelected = (mode: AlignMode) => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    setCanvasItems((prev) =>
      prev.map((item) => {
        if (!ids.has(item.instanceId)) return item;
        const next = alignBox(item, mode, {
          width: artboardW,
          height: artboardH,
        });
        return { ...item, ...next };
      }),
    );
    announce(
      mode === 'center'
        ? 'Centered'
        : mode === 'middle'
          ? 'Aligned to middle'
          : 'Aligned to bottom',
    );
  };

  const duplicateSelected = () => {
    if (selectedIds.length === 0) return;
    pushUndo();
    const ids = new Set(selectedIds);
    setCanvasItems((prev) => {
      const sources = byZ(prev.filter((i) => ids.has(i.instanceId)));
      if (sources.length === 0) return prev;
      const clones: CanvasItem[] = sources.map((source, i) => ({
        ...source,
        instanceId: crypto.randomUUID(),
        x: source.x + 16,
        y: source.y + 16,
        zIndex: prev.length + i,
      }));
      const newIds = clones.map((c) => c.instanceId);
      queueMicrotask(() => setSelectedIds(newIds));
      return reindexZ([...byZ(prev), ...clones]);
    });
  };

  const selectAll = () => {
    const ids = byZ(canvasItemsRef.current).map((i) => i.instanceId);
    setSelectedIds(ids);
  };

  const copySelected = () => {
    const ids = new Set(selectedIdsRef.current);
    const sources = byZ(canvasItemsRef.current).filter((i) =>
      ids.has(i.instanceId),
    );
    if (sources.length === 0) return;
    const minX = Math.min(...sources.map((s) => s.x));
    const minY = Math.min(...sources.map((s) => s.y));
    clipboardRef.current = {
      items: sources.map(
        ({ instanceId: _id, zIndex: _z, x, y, ...rest }) => ({
          ...rest,
          offsetX: x - minX,
          offsetY: y - minY,
        }),
      ),
    };
    setClipboardRev((n) => n + 1);
    announce(
      sources.length === 1 ? 'Copied' : `Copied ${sources.length} devices`,
    );
  };

  const pasteClipboard = () => {
    const payload = clipboardRef.current;
    if (!payload || payload.items.length === 0) return;
    pushUndo();
    const originX = 16;
    const originY = 16;
    setCanvasItems((prev) => {
      const clones: CanvasItem[] = payload.items.map((entry, i) => {
        const { offsetX, offsetY, ...rest } = entry;
        return clampItemToArtboard(
          {
            ...rest,
            instanceId: crypto.randomUUID(),
            x: originX + offsetX,
            y: originY + offsetY,
            zIndex: prev.length + i,
          },
          { width: artboardW, height: artboardH },
        );
      });
      const newIds = clones.map((c) => c.instanceId);
      queueMicrotask(() => setSelectedIds(newIds));
      return reindexZ([...byZ(prev), ...clones]);
    });
    announce(
      payload.items.length === 1
        ? 'Pasted'
        : `Pasted ${payload.items.length} devices`,
    );
  };

  const requestScreenImage = () => {
    // Prefer selection; otherwise target devices that still need a photo.
    let ids = selectedIdsRef.current;
    if (ids.length === 0) {
      ids = canvasItemsRef.current
        .filter((i) => i.screenImageSrc == null)
        .map((i) => i.instanceId);
      if (ids.length === 0) {
        ids = canvasItemsRef.current.map((i) => i.instanceId);
      }
      if (ids.length === 0) return;
      setSelectedIds(ids);
      selectedIdsRef.current = ids;
    }
    screenFileInputRef.current?.click();
  };

  const applyScreenImageFile = async (file: File) => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    if (!file.type.startsWith('image/')) {
      announce('Choose an image file');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      announce('Image too large (max 25 MB)');
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      announce('Could not read image');
      return;
    }

    const idSet = new Set(ids);
    const targets = canvasItemsRef.current.filter((i) =>
      idSet.has(i.instanceId),
    );
    if (targets.length === 0) return;

    // Prefer catalog clip rects; fall back to runtime detection.
    const prepared = new Map<
      string,
      { screenBounds: ContentBounds; screenRx: number; punchedSrc: string }
    >();
    for (const item of targets) {
      if (prepared.has(item.src)) continue;
      const catalog = getCatalogScreenRect(item.catalogFile);
      if (catalog) {
        prepared.set(item.src, {
          screenBounds: {
            x: catalog.x,
            y: catalog.y,
            width: catalog.width,
            height: catalog.height,
          },
          screenRx: catalog.rx,
          // Library SVGs ship with transparent apertures.
          punchedSrc: item.src,
        });
        continue;
      }
      const screenInfo = await getDeviceScreenInfo(
        item.src,
        item.contentBounds,
      );
      const screenBounds = screenInfo.bounds;
      const punchedSrc = screenInfo.hasTransparentAperture
        ? item.src
        : await getPunchedDeviceSrc(item.src, screenBounds);
      prepared.set(item.src, {
        screenBounds,
        screenRx: 0,
        punchedSrc,
      });
    }

    pushUndo();
    setCanvasItems((prev) =>
      prev.map((item) => {
        if (!idSet.has(item.instanceId)) return item;
        const p = prepared.get(item.src);
        if (!p) return item;
        return {
          ...item,
          screenImageSrc: dataUrl,
          screenBounds: p.screenBounds,
          screenRx: p.screenRx,
          punchedSrc: p.punchedSrc,
          screenPanX: 0,
          screenPanY: 0,
          screenZoom: 1,
        };
      }),
    );
    announce(
      targets.length === 1
        ? 'Screen image added'
        : `Screen image added to ${targets.length} devices`,
    );
  };

  const removeScreenImage = () => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) return;
    const hasAny = canvasItemsRef.current.some(
      (i) => ids.has(i.instanceId) && i.screenImageSrc != null,
    );
    if (!hasAny) return;
    pushUndo();
    setCanvasItems((prev) =>
      prev.map((item) =>
        ids.has(item.instanceId) && item.screenImageSrc != null
          ? {
              ...item,
              screenImageSrc: null,
              screenBounds: null,
              screenRx: 0,
              punchedSrc: null,
              screenPanX: 0,
              screenPanY: 0,
              screenZoom: 1,
            }
          : item,
      ),
    );
    announce('Screen image removed');
  };

  const resetScreenFraming = () => {
    const ids = new Set(selectedIdsRef.current);
    const hasAny = canvasItemsRef.current.some(
      (i) =>
        ids.has(i.instanceId) &&
        i.screenImageSrc != null &&
        (i.screenPanX !== 0 || i.screenPanY !== 0 || i.screenZoom !== 1),
    );
    if (!hasAny) {
      const anyImage = canvasItemsRef.current.some(
        (i) => ids.has(i.instanceId) && i.screenImageSrc != null,
      );
      if (anyImage) announce('Framing already centered');
      return;
    }
    pushUndo();
    setCanvasItems((prev) =>
      prev.map((item) =>
        ids.has(item.instanceId) && item.screenImageSrc != null
          ? { ...item, screenPanX: 0, screenPanY: 0, screenZoom: 1 }
          : item,
      ),
    );
    announce('Framing reset');
  };

  const handleScreenPointerDown = (
    e: React.PointerEvent,
    item: CanvasItem,
  ) => {
    if (!item.screenImageSrc || !item.screenBounds) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setSelectedIds((prev) =>
      prev.includes(item.instanceId)
        ? [...prev.filter((id) => id !== item.instanceId), item.instanceId]
        : [item.instanceId],
    );
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenW =
      (item.screenBounds.width / Math.max(1, item.contentBounds.width)) *
      item.displayWidth;
    const screenH =
      (item.screenBounds.height / Math.max(1, item.contentBounds.height)) *
      item.displayHeight;
    // Convert screen size to client pixels for drag sensitivity.
    const clientScreenW = (screenW / artboardW) * rect.width;
    const clientScreenH = (screenH / artboardH) * rect.height;
    pushUndo();
    setScreenDrag({
      id: item.instanceId,
      lastX: e.clientX,
      lastY: e.clientY,
      screenW: Math.max(1, clientScreenW),
      screenH: Math.max(1, clientScreenH),
    });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const emptyDownloadConfirmRef = useRef(false);

  const applyWebsiteUrl = (url: string) => {
    clearWebsiteCaptureCache();
    setWebsiteUrl(url);
    setWebsiteUrlDraft(url);
    const n = canvasItemsRef.current.length;
    setCapturingHint(
      `Updating ${n} screen${n === 1 ? '' : 's'}…`,
    );
    window.setTimeout(() => setCapturingHint(null), 4000);
    announce(`Website applied: ${websiteHostname(url)}`);
  };

  const tryApplyWebsiteUrl = (raw: string) => {
    const normalized = normalizeWebsiteUrl(raw);
    if (!normalized) {
      announce('Enter a valid http(s) URL');
      return;
    }
    applyWebsiteUrl(normalized);
  };

  const showOnDevices = async (url: string) => {
    const ok = await applyLayoutPreset('apple-lineup');
    if (!ok) return;
    applyWebsiteUrl(url);
  };

  const clearWebsiteUrl = () => {
    if (!websiteUrl && !websiteUrlDraft.trim()) return;
    clearWebsiteCaptureCache();
    setWebsiteUrl(null);
    setWebsiteUrlDraft('');
    setCapturingHint(null);
    announce('Website cleared');
  };

  const setSelectedScreenZoom = (zoom: number) => {
    const ids = new Set(selectedIdsRef.current);
    const targets = canvasItemsRef.current.filter(
      (i) => ids.has(i.instanceId) && i.screenImageSrc != null,
    );
    if (targets.length === 0) return;
    pushUndo();
    const next = clampScreenZoom(zoom);
    setCanvasItems((prev) =>
      prev.map((item) =>
        ids.has(item.instanceId) && item.screenImageSrc != null
          ? { ...item, screenZoom: next }
          : item,
      ),
    );
  };

  const downloadCanvas = async () => {
    if (canvasItems.length === 0 || isExporting) return;
    const screensFilledNow = canvasItems.some(
      (i) => i.screenImageSrc != null || websiteUrl != null,
    );
    if (!screensFilledNow && !emptyDownloadConfirmRef.current) {
      emptyDownloadConfirmRef.current = true;
      setSoftEmptyDownload(true);
      announce('Screens are empty — click Download again to continue');
      window.setTimeout(() => {
        emptyDownloadConfirmRef.current = false;
        setSoftEmptyDownload(false);
      }, 4000);
      return;
    }
    emptyDownloadConfirmRef.current = false;
    setSoftEmptyDownload(false);
    setIsExporting(true);
    setSelectedIds([]);
    setExportMenuOpen(false);
    try {
      const websiteJobs = websiteUrl
        ? canvasItems
            .filter((item) => !item.screenImageSrc)
            .map((item) => {
              const viewport = getWebsiteViewport(
                item.category,
                item.catalogFile,
              );
              return {
                key: item.instanceId,
                url: websiteUrl,
                width: viewport.width,
                height: viewport.height,
              };
            })
        : [];

      let websiteShots = new Map<string, string>();
      if (websiteJobs.length > 0) {
        announce('Capturing website for download…');
        try {
          websiteShots = await captureWebsiteScreenshotsCached(websiteJobs);
        } catch (err) {
          throw new Error(describeCaptureError(err));
        }
      }

      const { blob, filenameHint } = await exportMockup(
        canvasItems.map((item) => {
          const screen = resolveItemScreen(item);
          const captured = websiteShots.get(item.instanceId) ?? null;
          const screenImageSrc = item.screenImageSrc || captured;
          const usePunched =
            Boolean(screenImageSrc) &&
            (item.punchedSrc || Boolean(captured));
          return {
            src: usePunched ? (item.punchedSrc ?? item.src) : item.src,
            x: item.x,
            y: item.y,
            zIndex: item.zIndex,
            displayWidth: item.displayWidth,
            displayHeight: item.displayHeight,
            nativeWidth: item.nativeWidth,
            nativeHeight: item.nativeHeight,
            contentBounds: item.contentBounds,
            screenImageSrc,
            screenBounds: screen,
            screenRx: screen?.rx ?? item.screenRx,
            screenPanX: item.screenImageSrc ? item.screenPanX : 0,
            screenPanY: item.screenImageSrc ? item.screenPanY : 0,
            screenZoom: item.screenImageSrc ? item.screenZoom : 1,
          };
        }),
        {
          format: exportFormat,
          resolution: exportResolution,
          background: {
            mode: exportBgMode,
            color: exportBgColor,
            imageSrc: exportBgImageSrc,
          },
        },
        artboardW,
        artboardH,
      );
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const ext = filenameHint.includes('.')
        ? filenameHint.slice(filenameHint.lastIndexOf('.'))
        : '.png';
      downloadBlob(blob, `mockup-${stamp}-${exportResolution}${ext}`);
      announce('Downloaded');
    } catch (err) {
      console.error(err);
      announce(describeCaptureError(err));
    } finally {
      setIsExporting(false);
    }
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeDragRef.current = { startX: e.clientX, startW: libraryWidth };
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    setLibraryWidth(
      Math.min(
        LIBRARY_W_MAX,
        Math.max(LIBRARY_W_MIN, drag.startW + (e.clientX - drag.startX)),
      ),
    );
  };

  const onResizePointerUp = () => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    persistLibraryWidth(libraryWidth);
  };

  useEffect(() => {
    persistLibraryWidth(libraryWidth);
  }, [libraryWidth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
        setLayoutsMenuOpen(false);
        setMoreToolsOpen(false);
        setContextMenu(null);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.ms-ctx')) setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  useKeybindings(
    bindings,
    {
      deleteSelected,
      deselect: () => {
        setSelectedIds([]);
        setContextMenu(null);
      },
      bringForward,
      pushBackward,
      bringToFront,
      sendToBack,
      nudgeLeft: () => nudgeSelected(-1, 0),
      nudgeRight: () => nudgeSelected(1, 0),
      nudgeUp: () => nudgeSelected(0, -1),
      nudgeDown: () => nudgeSelected(0, 1),
      nudgeLeftLarge: () => nudgeSelected(-10, 0),
      nudgeRightLarge: () => nudgeSelected(10, 0),
      nudgeUpLarge: () => nudgeSelected(0, -10),
      nudgeDownLarge: () => nudgeSelected(0, 10),
      duplicate: duplicateSelected,
      undo,
      download: () => {
        void downloadCanvas();
      },
      openShortcuts: () => setShortcutsOpen(true),
      selectAll,
      copy: copySelected,
      paste: pasteClipboard,
    },
    { platform, enabled: !shortcutsOpen },
  );

  const toggleLibraryCollapsed = () => {
    setLibraryCollapsed((v) => {
      const next = !v;
      persistLibraryCollapsed(next);
      return next;
    });
  };

  const devicesDrawerOpen = !libraryCollapsed;

  const openDevicesPicker = () => {
    setLibraryCollapsed(false);
    persistLibraryCollapsed(false);
    queueMicrotask(() => searchInputRef.current?.focus());
  };

  const openContextMenu = (
    e: React.MouseEvent,
    target: ContextMenuState['target'],
    item?: CanvasItem,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (target === 'device' && item) {
      setSelectedIds((prev) =>
        prev.includes(item.instanceId)
          ? [...prev.filter((id) => id !== item.instanceId), item.instanceId]
          : [item.instanceId],
      );
    }
    const pad = 8;
    const menuW = 240;
    const menuH = target === 'device' ? 560 : 100;
    const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
    const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
    setContextMenu({
      x: Math.max(pad, x),
      y: Math.max(pad, y),
      target,
    });
  };

  const canPaste = clipboardRev > 0 && (clipboardRef.current?.items.length ?? 0) > 0;

  const findDeviceByPath = (path: string): DeviceItem | undefined => {
    for (const items of Object.values(groupedLibrary)) {
      const found = items.find((d) => d.path === path);
      if (found) return found;
    }
    return undefined;
  };

  const primaryPhotoZoom =
    primaryId == null
      ? 1
      : (canvasItems.find((i) => i.instanceId === primaryId)?.screenZoom ?? 1);

  const closeChromeMenus = () => {
    setExportMenuOpen(false);
    setLayoutsMenuOpen(false);
    setMoreToolsOpen(false);
  };

  return (
    <div
      className={`ms-app${libraryCollapsed ? ' ms-app--library-collapsed' : ''}${canvasItems.length === 0 ? ' ms-app--empty' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (
          !t.closest('.ms-download-cluster') &&
          !t.closest('.ms-rail-menu-wrap')
        ) {
          closeChromeMenus();
        }
      }}
    >
      <TopCommandBar
        hasDevices={canvasItems.length > 0}
        websiteUrlDraft={websiteUrlDraft}
        onWebsiteUrlDraftChange={setWebsiteUrlDraft}
        onApplyUrl={tryApplyWebsiteUrl}
        onClearUrl={clearWebsiteUrl}
        websiteUrlActive={websiteUrl != null}
        captureBusy={capturingHint != null}
        captureCount={canvasItems.length}
        downloading={isExporting}
        softEmptyDownload={softEmptyDownload}
        exportFormat={exportFormat}
        exportResolution={exportResolution}
        exportTransparentBg={exportBgMode === 'transparent'}
        onExportFormat={setExportFormat}
        onExportResolution={setExportResolution}
        onExportTransparentBg={(v) =>
          setExportBgMode(v ? 'transparent' : 'color')
        }
        onDownload={() => void downloadCanvas()}
        downloadMenuOpen={exportMenuOpen}
        onDownloadMenuOpenChange={setExportMenuOpen}
        downloadMenuRef={downloadMenuRef}
      />

      <div className="ms-body">
        <IconRail
          devicesOpen={devicesDrawerOpen}
          onToggleDevices={toggleLibraryCollapsed}
          layoutsOpen={layoutsMenuOpen}
          onLayoutsOpenChange={setLayoutsMenuOpen}
          moreOpen={moreToolsOpen}
          onMoreOpenChange={setMoreToolsOpen}
          placing={placingPath != null}
          onApplyPreset={(id) => void applyLayoutPreset(id)}
          artboardFormatId={artboardFormatId}
          onArtboardFormat={changeArtboardFormat}
          sizeScaleId={sizeScaleId}
          onSizeScale={changeSizeScale}
          snapEnabled={snapEnabled}
          onSnapEnabled={(v) => {
            if (v === snapEnabled) return;
            toggleSnap();
          }}
          onAlignH={() => alignSelected('center')}
          onAlignV={() => alignSelected('middle')}
          onBringForward={bringForward}
          onSendBackward={pushBackward}
          canReorder={canBringForward || canPushBackward}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          layoutsRef={layoutsMenuRef}
          moreRef={moreMenuRef}
        />

        <button
          type="button"
          className={`ms-library-backdrop${devicesDrawerOpen ? ' is-open' : ''}`}
          onClick={() => {
            setLibraryCollapsed(true);
            persistLibraryCollapsed(true);
          }}
          aria-label="Close device library"
          aria-hidden={!devicesDrawerOpen}
          tabIndex={devicesDrawerOpen ? 0 : -1}
        />

        <LibraryPanel
          open={devicesDrawerOpen}
          width={libraryWidth}
          categories={categories}
          effectiveCategory={effectiveCategory}
          availableBrands={availableBrands}
          brandAll={brandAll}
          selectedBrand={selectedBrand}
          availableProducts={availableProducts}
          selectedProductValid={selectedProductValid}
          searchQuery={searchQuery}
          filteredLibrary={filteredLibrary}
          placingPath={placingPath}
          searchIsGlobal={searchIsGlobal}
          searchInputRef={searchInputRef}
          onClose={() => {
            setLibraryCollapsed(true);
            persistLibraryCollapsed(true);
          }}
          onCategoryChange={(c) => {
            setCategoryFilter(c);
            setSelectedProduct(null);
            setSearchQuery('');
          }}
          onBrandAll={() => {
            setSelectedBrand(null);
            setSelectedProduct(null);
          }}
          onSelectBrand={(b) => {
            setSelectedBrand(b);
            setSelectedProduct(null);
          }}
          onProductAll={() => setSelectedProduct(null)}
          onSelectProduct={(p) =>
            setSelectedProduct((prev) => (prev === p ? null : p))
          }
          onSearchChange={setSearchQuery}
          onClearFilters={() => {
            setSelectedBrand(null);
            setSelectedProduct(null);
            setSearchQuery('');
          }}
          onAddDevice={(item) => void handleAddAndSelect(item)}
          onResizePointerDown={onResizePointerDown}
          onResizePointerMove={onResizePointerMove}
          onResizePointerUp={onResizePointerUp}
        />

        <div className="ms-workspace">
          <SelectionInspector
            open={hasSelection}
            canEditPhoto={selectionHasScreenImage}
            photoZoom={primaryPhotoZoom}
            onPhotoZoom={setSelectedScreenZoom}
            onResetPhotoFraming={resetScreenFraming}
            onUploadPhoto={requestScreenImage}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onBringForward={bringForward}
            onSendBackward={pushBackward}
            canReorder={canBringForward || canPushBackward}
          />

          <div className="ms-stage">
            {canvasItems.length === 0 ? (
              <EmptyHero
                busy={placingPath != null}
                onShowOnDevices={(url) => void showOnDevices(url)}
                onStartLayoutOnly={() => void applyLayoutPreset('apple-lineup')}
                onBrowseDevices={openDevicesPicker}
              />
            ) : null}

            <div
              className="ms-view-zoom"
              role="group"
              aria-label="Canvas zoom"
            >
              <button
                type="button"
                className="ms-btn ms-btn--icon"
                aria-pressed={viewZoom === 'fit'}
                title="Fit fills the window · 100% = artboard pixels"
                aria-label="Fit artboard to stage"
                onClick={() => setViewZoom('fit')}
              >
                Fit
              </button>
              <button
                type="button"
                className="ms-btn ms-btn--icon"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => setViewZoom((z) => stepViewZoom(z, -1))}
              >
                −
              </button>
              <span className="ms-view-zoom-label" title="Fit fills the window · 100% = artboard pixels">
                {viewZoomLabel(viewZoom)}
              </span>
              <button
                type="button"
                className="ms-btn ms-btn--icon"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => setViewZoom((z) => stepViewZoom(z, 1))}
              >
                +
              </button>
            </div>

            <div
              ref={canvasRef}
              className="ms-artboard"
              style={{
                width: artboardWidthCss(viewZoom, {
                  width: artboardW,
                  height: artboardH,
                }),
                aspectRatio: `${artboardW} / ${artboardH}`,
              }}
              onClick={(e) => {
                if (e.target === canvasRef.current) setSelectedIds([]);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const t = e.target as HTMLElement;
                if (t.closest('.ms-canvas-item')) return;
                openContextMenu(e, 'artboard');
              }}
              onDragOver={(e) => {
                if (
                  e.dataTransfer.types.includes(LIBRARY_DRAG_MIME) ||
                  e.dataTransfer.types.includes('text/plain')
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const path =
                  e.dataTransfer.getData(LIBRARY_DRAG_MIME) ||
                  e.dataTransfer.getData('text/plain');
                const device = findDeviceByPath(path);
                if (!device || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const logical = clientToLogical(
                  e.clientX,
                  e.clientY,
                  rect,
                  artboardW,
                  artboardH,
                );
                void handleAddAndSelect(device, {
                  x: logical.x,
                  y: logical.y,
                });
              }}
            >
              {(snapGuides.vertical.length > 0 ||
                snapGuides.horizontal.length > 0) && (
                <div className="ms-snap-guides" aria-hidden="true">
                  {snapGuides.vertical.map((g) => (
                    <div
                      key={`v-${g.kind}-${g.pos}`}
                      className={[
                        'ms-snap-guide',
                        'ms-snap-guide--v',
                        g.kind === 'page'
                          ? 'ms-snap-guide--page'
                          : 'ms-snap-guide--sibling',
                      ].join(' ')}
                      style={{ left: `${(g.pos / artboardW) * 100}%` }}
                    />
                  ))}
                  {snapGuides.horizontal.map((g) => (
                    <div
                      key={`h-${g.kind}-${g.pos}`}
                      className={[
                        'ms-snap-guide',
                        'ms-snap-guide--h',
                        g.kind === 'page'
                          ? 'ms-snap-guide--page'
                          : 'ms-snap-guide--sibling',
                      ].join(' ')}
                      style={{ top: `${(g.pos / artboardH) * 100}%` }}
                    />
                  ))}
                </div>
              )}
              {canvasItems.map((item) => {
                const displayName = formatDeviceDisplayName(item.name);
                const isSelected = selectedIdSet.has(item.instanceId);
                const showCaption =
                  isSelected || hoveredId === item.instanceId;
                return (
                <div
                  key={item.instanceId}
                  role="img"
                  aria-label={displayName}
                  title={displayName}
                  onPointerDown={(e) => handlePointerDown(e, item)}
                  onContextMenu={(e) => openContextMenu(e, 'device', item)}
                  onPointerEnter={() => setHoveredId(item.instanceId)}
                  onPointerLeave={() =>
                    setHoveredId((id) =>
                      id === item.instanceId ? null : id,
                    )
                  }
                  className={[
                    'ms-canvas-item',
                    isSelected ? 'ms-canvas-item--selected' : '',
                    dragInfo.groupIds.includes(item.instanceId)
                      ? 'ms-canvas-item--grabbing'
                      : 'ms-canvas-item--grab',
                    showCaption ? 'ms-canvas-item--caption' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${(item.x / artboardW) * 100}%`,
                    top: `${(item.y / artboardH) * 100}%`,
                    width: `${(item.displayWidth / artboardW) * 100}%`,
                    height: `${(item.displayHeight / artboardH) * 100}%`,
                    zIndex:
                      showCaption && isSelected
                        ? item.zIndex + 1000
                        : showCaption
                          ? item.zIndex + 100
                          : item.zIndex,
                  }}
                >
                  <div className="ms-canvas-item__frame">
                    {(() => {
                      const screen = resolveItemScreen(item);
                      if (item.screenImageSrc && screen) {
                        return (
                          <>
                            <div
                              className="ms-canvas-item__screen"
                              style={screenClipInsetCss(
                                screen,
                                item.contentBounds,
                              )}
                            >
                              <img
                                src={item.screenImageSrc}
                                alt=""
                                draggable={false}
                                className="ms-canvas-item__screen-img"
                                style={{
                                  objectPosition: (() => {
                                    const p = screenObjectPosition(
                                      item.screenPanX,
                                      item.screenPanY,
                                    );
                                    return `${p.x}% ${p.y}%`;
                                  })(),
                                  transform: `scale(${item.screenZoom})`,
                                }}
                              />
                            </div>
                            {isSelected ? (
                              <div
                                className={[
                                  'ms-canvas-item__screen-hit',
                                  screenDrag?.id === item.instanceId
                                    ? 'ms-canvas-item__screen-hit--panning'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                style={screenLayerStyle(
                                  screen,
                                  item.contentBounds,
                                )}
                                onPointerDown={(e) =>
                                  handleScreenPointerDown(e, item)
                                }
                              />
                            ) : null}
                          </>
                        );
                      }
                      if (websiteUrl && screen) {
                        const viewport = getWebsiteViewport(
                          item.category,
                          item.catalogFile,
                        );
                        const rxPct =
                          screen.width > 0
                            ? (screen.rx / screen.width) * 100
                            : 0;
                        return (
                          <div
                            className="ms-canvas-item__screen ms-canvas-item__screen--website"
                            style={{
                              ...screenLayerStyle(screen, item.contentBounds),
                              borderRadius:
                                screen.rx > 0 ? `${rxPct}%` : undefined,
                            }}
                          >
                            <WebsiteScreen
                              url={websiteUrl}
                              viewport={viewport}
                              title={`Website on ${displayName}`}
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <img
                      src={
                        item.screenImageSrc && item.punchedSrc
                          ? item.punchedSrc
                          : item.src
                      }
                      alt=""
                      draggable={false}
                      className="ms-canvas-item__img"
                      style={contentCropImgStyle(
                        item.contentBounds,
                        item.nativeWidth,
                        item.nativeHeight,
                      )}
                    />
                  </div>
                  {showCaption && (
                    <span className="ms-canvas-item__caption" aria-hidden="true">
                      {displayName}
                    </span>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={screenFileInputRef}
        type="file"
        accept="image/*"
        className="ms-screen-file-input"
        aria-label="Choose a screen image for selected devices"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (file) void applyScreenImageFile(file);
        }}
      />

      {layerHint ? (
        <div className="ms-hint-bar" role="status">
          <span>{layerHint}</span>
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={() => setLayerHint(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="ms-toast" role="status">
          {statusMessage}
        </div>
      ) : null}

      <div className="ms-a11y-live" aria-live="polite">
        {statusMessage}
      </div>

      <nav className="ms-mobile-dock" aria-label="Quick actions">
        <button
          type="button"
          className="ms-mobile-dock__btn"
          aria-label="Devices"
          onClick={openDevicesPicker}
        >
          Devices
        </button>
        {canvasItems.length > 0 ? (
          <button
            type="button"
            className="ms-mobile-dock__btn"
            aria-label="Website URL"
            onClick={() => {
              document.getElementById('ms-url-command-input')?.focus();
            }}
          >
            URL
          </button>
        ) : null}
        {canvasItems.length > 0 ? (
          <button
            type="button"
            className="ms-mobile-dock__btn ms-mobile-dock__btn--accent"
            disabled={isExporting}
            onClick={() => void downloadCanvas()}
          >
            Download
          </button>
        ) : null}
      </nav>

      <KeybindingsPanel
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        bindings={bindings}
        onBindingsChange={setBindings}
        platform={platform}
      />

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          platform={platform}
          hasSelection={hasSelection}
          hasScreenImage={selectionHasScreenImage}
          canPaste={canPaste}
          canBringForward={canBringForward}
          canPushBackward={canPushBackward}
          canBringToFront={canBringToFront}
          canSendToBack={canSendToBack}
          onSelectAll={selectAll}
          onCopy={copySelected}
          onPaste={pasteClipboard}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
          onBringForward={bringForward}
          onPushBackward={pushBackward}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onAlign={alignSelected}
          onAddScreenImage={requestScreenImage}
          onRemoveScreenImage={removeScreenImage}
          onResetScreenFraming={resetScreenFraming}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
