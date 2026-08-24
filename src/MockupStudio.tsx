import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DeviceItem } from './App';
import {
  applySizeScale,
  ARTBOARD_FORMATS,
  CATEGORY_ORDER,
  displayHeightForContent,
  displaySizeFromMm,
  getArtboardFormat,
  getSizeScalePreset,
  persistArtboardFormatId,
  persistSizeScaleId,
  readStoredArtboardFormatId,
  readStoredSizeScaleId,
  SIZE_SCALE_PRESETS,
  type ArtboardFormatId,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import {
  alignBox,
  clampItemToArtboard,
  NO_GUIDES,
  persistSnapEnabled,
  readSnapEnabled,
  readSnapMargin,
  snapPosition,
  SNAP_PX,
  type AlignMode,
  type SnapGuideLine,
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
} from './deviceScreenBounds';
import {
  getCatalogScreenRect,
  resolveItemScreen,
} from './deviceScreens';
import {
  getImageContentBounds,
  type ContentBounds,
} from './imageContentBounds';
import { loadNativeSize } from './loadImage';
import {
  captureUnavailableNotice,
  captureWebsiteScreenshotsCached,
  classifyCaptureError,
  classifyWebsiteInput,
  clearWebsiteCaptureCache,
  ensureCaptureAvailable,
  type CaptureNotice,
} from './captureWebsite';
import {
  getWebsiteViewport,
  normalizeWebsiteUrl,
  websiteHostname,
} from './websiteUrl';
import { warmProxy } from './websiteProxy';
import EmptyHero from './EmptyHero';
import IconRail from './IconRail';
import ProgressLoader from './ProgressLoader';
import SelectionInspector from './SelectionInspector';
import TopCommandBar from './TopCommandBar';
import ViewZoomBar from './ViewZoom';
import MobileToolbar from './MobileToolbar';
import {
  getLayoutPreset,
  indexLibraryByCatalog,
  resolvePresetDevices,
  resolveSlotPosition,
  type LayoutPreset,
} from './layoutPresets';
import KeybindingsPanel from './KeybindingsPanel';
import ContextMenu, { type ContextMenuState } from './ContextMenu';
import LibraryPanel, {
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
import { usePresence } from './usePresence';
import { useTheme } from './useTheme';
import { useWebsitePreviewMode } from './useWebsitePreviewMode';
import { useCredits } from './useCredits';
import {
  getScreenshotProvider,
  setScreenshotProvider,
  getScreenshotApiKey,
  setScreenshotApiKey,
  getMicrolinkApiKey,
  setMicrolinkApiKey,
  type ScreenshotProvider,
} from './screenshotProviders';
import { onCreditsUpdate } from './captureWebsite';
import MobileDock from './MobileDock';
import StatusShell from './StatusShell';
import ArtboardCanvas from './ArtboardCanvas';
import AppDialog from './AppDialog';
import { clientToLogical } from './clientToLogical';

const LIBRARY_W_KEY = 'pixelMockup.libraryWidth';
const LIBRARY_W_LEGACY_KEY = 'mockupStudio.libraryWidth';
const LIBRARY_W_DEFAULT = 320;
const LIBRARY_COLLAPSED_KEY = 'pixelMockup.libraryCollapsed';
const LIBRARY_COLLAPSED_LEGACY_KEY = 'mockupStudio.libraryCollapsed';

/** How long a magenta (page) guide stays "glued" after it latches. */
const STICKY_SNAP_MS = 1000;
/** Pointer may drift this far from a latched page guide before it releases. */
const SNAP_RELEASE_PX = SNAP_PX * 2.5;

type StickyAxis = { guidePos: number; origin: number; until: number };

/** Smallest gap between any anchor (start/center/end) and a guide line. */
function axisDistanceToGuide(
  origin: number,
  size: number,
  guidePos: number,
): number {
  return Math.min(
    Math.abs(origin - guidePos),
    Math.abs(origin + size / 2 - guidePos),
    Math.abs(origin + size - guidePos),
  );
}

/**
 * Sticky page-guide resolution for one axis. A magenta guide stays latched for
 * ~1s so the device glues to it instead of drifting off on the first pixel.
 */
function resolveStickyAxis(
  sticky: StickyAxis | null,
  snappedOrigin: number,
  guide: SnapGuideLine | null,
  proposedOrigin: number,
  size: number,
  now: number,
): { origin: number; guide: SnapGuideLine | null; sticky: StickyAxis | null } {
  if (guide?.kind === 'page') {
    return {
      origin: snappedOrigin,
      guide,
      sticky: { guidePos: guide.pos, origin: snappedOrigin, until: now + STICKY_SNAP_MS },
    };
  }
  if (
    sticky &&
    now < sticky.until &&
    axisDistanceToGuide(proposedOrigin, size, sticky.guidePos) <= SNAP_RELEASE_PX
  ) {
    return {
      origin: sticky.origin,
      guide: { pos: sticky.guidePos, kind: 'page' },
      sticky,
    };
  }
  return { origin: snappedOrigin, guide, sticky: null };
}

/** Shift a placed group so its bounding-box center sits at the artboard center. */
function centerGroupOnArtboard(
  items: { x: number; y: number; displayWidth: number; displayHeight: number }[],
  artboardW: number,
  artboardH: number,
): void {
  if (items.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.displayWidth);
    maxY = Math.max(maxY, it.y + it.displayHeight);
  }
  const shiftX = artboardW / 2 - (minX + maxX) / 2;
  const shiftY = artboardH / 2 - (minY + maxY) / 2;
  for (const it of items) {
    it.x += shiftX;
    it.y += shiftY;
  }
}

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
    const flag = collapsed ? '1' : '0';
    if (flag === '0' || flag === '1') {
      storageSet(LIBRARY_COLLAPSED_KEY, flag);
    }
  } catch {
    // ignore
  }
}

interface MockupStudioProps {
  groupedLibrary: Record<string, DeviceItem[]>;
  categories: string[];
  loadedCategories: Set<string>;
  loadingDevicePaths: Set<string>;
  libraryLoading: boolean;
  libraryProgress: number;
  libraryStatusMessage?: string | null;
  onLoadCategory: (category: string) => void;
  onLoadDevice: (path: string) => Promise<DeviceItem | null>;
  onLoadCategoriesForPreset: (preset: LayoutPreset) => Promise<void>;
  onTakeTour?: () => void;
}

export interface CanvasItem extends DeviceItem {
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** True when the first bytes match PNG / JPEG / WebP signatures. */
async function looksLikeAllowedImage(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (header.length < 3) return false;
  // PNG: 89 50 4E 47
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return true;
  }
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return true;
  }
  // WebP: RIFF....WEBP
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return true;
  }
  return false;
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
    if (!Number.isFinite(w)) return;
    const clamped = Math.min(LIBRARY_W_MAX, Math.max(LIBRARY_W_MIN, w));
    storageSet(LIBRARY_W_KEY, String(clamped));
  } catch {
    // ignore
  }
}

function buildFilteredLibrary(
  brandFilteredDevices: DeviceItem[],
  selectedProductValid: string | null,
  searchQuery: string,
  searchIsGlobal: boolean,
  effectiveCategory: string | null,
) {
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
}

export default function MockupStudio({
  groupedLibrary,
  categories,
  loadedCategories,
  loadingDevicePaths,
  libraryLoading,
  libraryProgress,
  libraryStatusMessage,
  onLoadCategory,
  onLoadDevice,
  onLoadCategoriesForPreset,
  onTakeTour,
}: Readonly<MockupStudioProps>) {
  const platform = useMemo(() => detectPlatform(), []);
  const { theme, toggleTheme } = useTheme();
  const {
    websitePreviewMode,
    setWebsitePreviewMode,
  } = useWebsitePreviewMode();
  const activeUsers = usePresence();
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
  const [statusTone, setStatusTone] = useState<'info' | 'error'>('info');
  const [captureNotice, setCaptureNotice] = useState<CaptureNotice | null>(
    null,
  );
  const [presetConfirm, setPresetConfirm] = useState<{
    label: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const captureNoticeUrlRef = useRef<string | null>(null);
  const iframeFallbackSessionRef = useRef(false);

  // Screenshot provider settings
  const [screenshotProvider, setScreenshotProviderState] = useState<ScreenshotProvider>(
    getScreenshotProvider,
  );
  const [screenshotApiKeyState, setScreenshotApiKeyState] = useState(
    getScreenshotApiKey,
  );
  const [microlinkApiKeyState, setMicrolinkApiKeyState] = useState(
    getMicrolinkApiKey,
  );
  const { credits, updateCredits } = useCredits();

  useEffect(() => {
    onCreditsUpdate(updateCredits);
  }, [updateCredits]);

  const handleScreenshotApiKeyChange = useCallback((key: string) => {
    setScreenshotApiKeyState(key);
    setScreenshotApiKey(key);
  }, []);

  const handleMicrolinkApiKeyChange = useCallback((key: string) => {
    setMicrolinkApiKeyState(key);
    setMicrolinkApiKey(key);
  }, []);
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
  const stickyXRef = useRef<StickyAxis | null>(null);
  const stickyYRef = useRef<StickyAxis | null>(null);
  const undoStackRef = useRef<CanvasItem[][]>([]);
  const canvasItemsRef = useRef(canvasItems);
  canvasItemsRef.current = canvasItems;
  const groupedLibraryRef = useRef(groupedLibrary);
  groupedLibraryRef.current = groupedLibrary;

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

  const announce = (msg: string, tone: 'info' | 'error' = 'info') => {
    setStatusTone(tone);
    setStatusMessage(msg);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(
      () => setStatusMessage(null),
      tone === 'error' ? 3200 : 1600,
    );
  };

  const handleScreenshotProviderChange = useCallback((provider: ScreenshotProvider) => {
    setScreenshotProviderState(provider);
    setScreenshotProvider(provider);
    const label =
      provider === 'playwright'
        ? 'Local Playwright'
        : provider === 'screenshotapi'
          ? 'ScreenshotAPI'
          : 'Microlink';
    announce(`${label} selected`);
  }, []);

  const openCaptureNotice = useCallback((notice: CaptureNotice, urlKey?: string) => {
    if (urlKey != null) {
      if (captureNoticeUrlRef.current === urlKey) return;
      captureNoticeUrlRef.current = urlKey;
    }
    setCaptureNotice(notice);
  }, []);

  const closeCaptureNotice = () => {
    setCaptureNotice(null);
  };

  const focusWebsiteUrlField = () => {
    const el =
      document.getElementById('ms-url-command-input') ??
      document.getElementById('ms-mobile-url-input');
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  };

  const askReplacePreset = (label: string): Promise<boolean> =>
    new Promise((resolve) => {
      setPresetConfirm({ label, resolve });
    });

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

  // Pre-warm the proxy for the global site so the first iframe view hits a
  // warm server/CDN cache regardless of what was loaded before.
  useEffect(() => {
    if (!websiteUrl || websitePreviewMode !== 'iframe') return;
    warmProxy(websiteUrl);
  }, [websiteUrl, websitePreviewMode]);

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

  const filteredLibrary = useMemo(
    () =>
      buildFilteredLibrary(
        brandFilteredDevices,
        selectedProductValid,
        searchQuery,
        searchIsGlobal,
        effectiveCategory,
      ),
    [
      brandFilteredDevices,
      selectedProductValid,
      searchQuery,
      searchIsGlobal,
      effectiveCategory,
    ],
  );

  const primaryId =
    selectedIds.length > 0 ? selectedIds.at(- 1)! : null;
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
      let ready = item;
      if (!ready.src) {
        const loaded = await onLoadDevice(ready.path);
        if (!loaded?.src) {
          announce('Could not load that device.');
          return;
        }
        ready = loaded;
      }
      const probe = await buildCanvasItem(ready, {
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
      const ok = await askReplacePreset(preset.label);
      if (!ok) return false;
    }
    setPlacingPath(preset.id);
    try {
      await onLoadCategoriesForPreset(preset);
      const resolved = resolvePresetDevices(
        preset,
        indexLibraryByCatalog(groupedLibraryRef.current),
      );
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
      centerGroupOnArtboard(placed, artboardW, artboardH);
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

  function selectionAfterPointerDown(
    selectedIds: string[],
    itemId: string,
    items: CanvasItem[],
    mod: boolean,
    shiftKey: boolean,
  ): string[] | null {
    if (mod) {
      return selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId];
    }
    if (shiftKey && selectedIds.length > 0) {
      const sorted = byZ(items);
      const primary = selectedIds.at(-1)!;
      const a = sorted.findIndex((i) => i.instanceId === primary);
      const b = sorted.findIndex((i) => i.instanceId === itemId);
      if (a < 0 || b < 0) return null;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const range = sorted.slice(lo, hi + 1).map((i) => i.instanceId);
      return [...range.filter((id) => id !== itemId), itemId];
    }
    return null; // caller keeps current selection / single-select path
  }

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
    const mod = isMacPlatform(platform) ? e.metaKey : e.ctrlKey;

    const adjusted = selectionAfterPointerDown(
      selectedIdsRef.current,
      item.instanceId,
      canvasItemsRef.current,
      mod,
      e.shiftKey,
    );

    let nextSelected = selectedIdsRef.current;
    if (adjusted) {
      nextSelected = adjusted;
      setSelectedIds(nextSelected);
      if (mod || e.shiftKey) return;
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

    stickyXRef.current = null;
    stickyYRef.current = null;
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
      stickyXRef.current = null;
      stickyYRef.current = null;
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

    // Keep magenta page guides "sticky" for ~1s so the device stays glued.
    const now = performance.now();
    const rx = resolveStickyAxis(
      stickyXRef.current,
      x,
      guides.vertical[0] ?? null,
      proposedPrimary.x,
      primary.displayWidth,
      now,
    );
    const ry = resolveStickyAxis(
      stickyYRef.current,
      y,
      guides.horizontal[0] ?? null,
      proposedPrimary.y,
      primary.displayHeight,
      now,
    );
    stickyXRef.current = rx.sticky;
    stickyYRef.current = ry.sticky;

    const stuckGuides: SnapGuides = {
      vertical: rx.guide ? [rx.guide] : [],
      horizontal: ry.guide ? [ry.guide] : [],
    };

    const snapDx = rx.origin - originPrimary.x;
    const snapDy = ry.origin - originPrimary.y;
    const latchKey = snapGuidesLatchKey(stuckGuides);
    if (latchKey && latchKey !== lastSnapLatchKey.current) {
      pulseSnapHaptic();
    }
    lastSnapLatchKey.current = latchKey;
    setSnapGuides(stuckGuides);
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
    stickyXRef.current = null;
    stickyYRef.current = null;
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
    if (!SIZE_SCALE_PRESETS.some((p) => p.id === nextId)) return;
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
    if (!ARTBOARD_FORMATS.some((p) => p.id === nextId)) return;
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
    if (!primaryId || !canvasItems.some((i) => i.instanceId === primaryId)) return;
    pushUndo();
    setCanvasItems((prev) => bringToFrontItems(prev, primaryId) ?? prev);
  };

  const sendToBack = () => {
    if (!primaryId || !canvasItems.some((i) => i.instanceId === primaryId)) return;
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
    const ALIGN_ANNOUNCE: Record<AlignMode, string> = {
      center: 'Centered',
      middle: 'Aligned to middle',
      bottom: 'Aligned to bottom',
    };

    announce(ALIGN_ANNOUNCE[mode]);
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
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      announce('Choose a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      announce('Image too large (max 25 MB)');
      return;
    }
    if (!(await looksLikeAllowedImage(file))) {
      announce('File contents are not a valid PNG, JPEG, or WebP image');
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
    const n = canvasItemsRef.current.length;
    clearWebsiteCaptureCache();
    setWebsiteUrl(url);
    setWebsiteUrlDraft(url);
    setCapturingHint(
      `Updating ${n} screen${n === 1 ? '' : 's'}…`,
    );
    window.setTimeout(() => setCapturingHint(null), 4000);
    announce(`Website applied: ${websiteHostname(url)}`);
  };

  const tryApplyWebsiteUrl = (raw: string) => {
    void (async () => {
      const normalized = normalizeWebsiteUrl(raw);
      if (!normalized) {
        openCaptureNotice(classifyWebsiteInput(raw));
        return;
      }
      captureNoticeUrlRef.current = null;
      // Hosted builds: one probe, then dialog — avoid N device POSTs to a
      // missing /__capture_website endpoint.
      const available = await ensureCaptureAvailable();
      if (!available) {
        if (
          websitePreviewMode === 'screenshot' &&
          !iframeFallbackSessionRef.current
        ) {
          iframeFallbackSessionRef.current = true;
          setWebsitePreviewMode('iframe');
          announce('Switched to live iframe preview (capture unavailable)');
        }
        openCaptureNotice(captureUnavailableNotice(), normalized);
      }
      applyWebsiteUrl(normalized);
    })();
  };

  const showOnDevices = async (url: string) => {
    const ok = await applyLayoutPreset('apple-lineup');
    if (!ok) return;
    const available = await ensureCaptureAvailable();
    if (!available) {
      if (
        websitePreviewMode === 'screenshot' &&
        !iframeFallbackSessionRef.current
      ) {
        iframeFallbackSessionRef.current = true;
        setWebsitePreviewMode('iframe');
        announce('Switched to live iframe preview (capture unavailable)');
      }
      openCaptureNotice(captureUnavailableNotice(), url);
    }
    applyWebsiteUrl(url);
  };

  const clearWebsiteUrl = () => {
    if (!websiteUrl && !websiteUrlDraft.trim()) return;
    clearWebsiteCaptureCache();
    setWebsiteUrl(null);
    setWebsiteUrlDraft('');
    setCapturingHint(null);
    captureNoticeUrlRef.current = null;
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
        websiteShots = await captureWebsiteScreenshotsCached(websiteJobs);
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
      openCaptureNotice(classifyCaptureError(err));
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
        closeChromeMenus();
        setContextMenu(null);
        setLibraryCollapsed((collapsed) => {
          if (!collapsed) persistLibraryCollapsed(true);
          return true;
        });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;

      if (!t.closest('.ms-ctx')) setContextMenu(null);

      if (
        !t.closest('.ms-download-cluster') &&
        !t.closest('.ms-rail-menu-wrap')
      ) { closeChromeMenus(); }

      if (
        !libraryCollapsed &&
        !t.closest('.ms-library') &&
        !t.closest('.ms-rail-devices') &&
        !t.closest('.ms-mobile-dock')
      ) {
        setLibraryCollapsed(true);
        persistLibraryCollapsed(true);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [libraryCollapsed]);

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
      if (!next) {
        ensureCategoryAssets(effectiveCategory);
      }
      return next;
    });
  };

  const devicesDrawerOpen = !libraryCollapsed;

  const ensureCategoryAssets = (category: string | null | undefined) => {
    if (!category || loadedCategories.has(category)) return;
    // Phones and watches stay on-demand; only bulk-load common categories.
    if (
      category === 'computers' ||
      category === 'displays' ||
      category === 'tablets'
    ) {
      onLoadCategory(category);
    }
  };

  const openDevicesPicker = () => {
    setLibraryCollapsed(false);
    persistLibraryCollapsed(false);
    ensureCategoryAssets(effectiveCategory);
    queueMicrotask(() => searchInputRef.current?.focus());
  };

  const openContextMenu = (
    e: React.MouseEvent | React.PointerEvent,
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
    for (const items of Object.values(groupedLibraryRef.current)) {
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
        credits={credits}
        activeUsers={activeUsers}
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
          screenshotProvider={screenshotProvider}
          onScreenshotProviderChange={handleScreenshotProviderChange}
          screenshotApiKey={screenshotApiKeyState}
          onScreenshotApiKeyChange={handleScreenshotApiKeyChange}
          microlinkApiKey={microlinkApiKeyState}
          onMicrolinkApiKeyChange={handleMicrolinkApiKeyChange}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onTakeTour={onTakeTour}
          layoutsRef={layoutsMenuRef}
          moreRef={moreMenuRef}
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
          libraryLoading={libraryLoading}
          libraryProgress={libraryProgress}
          loadedCategories={loadedCategories}
          loadingDevicePaths={loadingDevicePaths}
          onClose={() => {
            setLibraryCollapsed(true);
            persistLibraryCollapsed(true);
          }}
          onCategoryChange={(c) => {
            setCategoryFilter(c);
            setSelectedProduct(null);
            setSearchQuery('');
            ensureCategoryAssets(c);
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
          onLoadDevice={(path) => void onLoadDevice(path)}
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

            <ViewZoomBar viewZoom={viewZoom} onViewZoom={setViewZoom} />

            <ArtboardCanvas
              canvasRef={canvasRef}
              viewZoom={viewZoom}
              artboardW={artboardW}
              artboardH={artboardH}
              snapGuides={snapGuides}
              canvasItems={canvasItems}
              selectedIdSet={selectedIdSet}
              hoveredId={hoveredId}
              dragInfo={dragInfo}
              screenDrag={screenDrag}
              websiteUrl={websiteUrl}
              websitePreviewMode={websitePreviewMode}
              setSelectedIds={setSelectedIds}
              setHoveredId={setHoveredId}
              openContextMenu={openContextMenu}
              handlePointerDown={handlePointerDown}
              handleScreenPointerDown={handleScreenPointerDown}
              handleAddAndSelect={handleAddAndSelect}
              findDeviceByPath={findDeviceByPath}
              onWebsiteCaptureFailed={(notice) =>
                openCaptureNotice(notice, websiteUrl ?? notice.summary)
              }
              onWebsiteCaptureDetails={(notice) => {
                setCaptureNotice(notice);
              }}
              onSwitchToIframePreview={() => {
                setWebsitePreviewMode('iframe');
                announce('Switched to live iframe preview');
              }}
            />

            {placingPath != null ? (
              <div className="ms-progress-loader-stage">
                <ProgressLoader
                  progress={libraryProgress}
                  activeMessage={libraryStatusMessage ?? undefined}
                  messages={[
                    'Placing devices...',
                    'Almost ready...',
                  ]}
                />
              </div>
            ) : null}
          </div>

          <MobileToolbar
            selectionOpen={hasSelection}
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
            viewZoom={viewZoom}
            onViewZoom={setViewZoom}
          />
        </div>
      </div>

      <StatusShell
        screenFileInputRef={screenFileInputRef}
        applyScreenImageFile={applyScreenImageFile}
        layerHint={layerHint}
        setLayerHint={setLayerHint}
        statusMessage={captureNotice ? null : statusMessage}
        statusTone={statusTone}
      />

      <AppDialog
        open={captureNotice != null}
        title={captureNotice?.title ?? ''}
        body={captureNotice?.body ?? ''}
        reason={captureNotice?.reason}
        detail={captureNotice?.remediation}
        technicalDetail={captureNotice?.technicalDetail}
        onClose={closeCaptureNotice}
        actions={[
          {
            label: 'Try another URL',
            variant: 'ghost',
            onClick: () => {
              closeCaptureNotice();
              focusWebsiteUrlField();
            },
          },
          {
            label: 'Upload screenshot',
            variant: 'primary',
            onClick: () => {
              closeCaptureNotice();
              requestScreenImage();
            },
          },
        ]}
      />

      <AppDialog
        open={presetConfirm != null}
        title="Replace artboard?"
        body={
          presetConfirm
            ? `Replace the artboard with “${presetConfirm.label}”? This cannot be undone from the preset itself — use Undo after if needed.`
            : ''
        }
        onClose={() => {
          presetConfirm?.resolve(false);
          setPresetConfirm(null);
        }}
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: () => {
              presetConfirm?.resolve(false);
              setPresetConfirm(null);
            },
          },
          {
            label: 'Replace',
            variant: 'primary',
            onClick: () => {
              presetConfirm?.resolve(true);
              setPresetConfirm(null);
            },
          },
        ]}
      />

      <MobileDock
        hasDevices={canvasItems.length > 0}
        isExporting={isExporting}
        websiteUrlDraft={websiteUrlDraft}
        onWebsiteUrlDraftChange={setWebsiteUrlDraft}
        onApplyUrl={tryApplyWebsiteUrl}
        onClearUrl={clearWebsiteUrl}
        websiteUrlActive={websiteUrl != null}
        captureBusy={capturingHint != null}
        exportFormat={exportFormat}
        exportResolution={exportResolution}
        exportTransparentBg={exportBgMode === 'transparent'}
        onExportFormat={setExportFormat}
        onExportResolution={setExportResolution}
        onExportTransparentBg={(v) => setExportBgMode(v ? 'transparent' : 'color')}
        onDownload={() => void downloadCanvas()}
        onDevices={openDevicesPicker}
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
        hasSelection={hasSelection}
        theme={theme}
        onToggleTheme={toggleTheme}
        screenshotProvider={screenshotProvider}
        onScreenshotProviderChange={handleScreenshotProviderChange}
        screenshotApiKey={screenshotApiKeyState}
        onScreenshotApiKeyChange={handleScreenshotApiKeyChange}
        microlinkApiKey={microlinkApiKeyState}
        onMicrolinkApiKeyChange={handleMicrolinkApiKeyChange}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onTakeTour={onTakeTour}
      />

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
