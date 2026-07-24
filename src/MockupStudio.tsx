import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { DeviceItem } from './App';
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  CATEGORY_ORDER,
  applySizeScale,
  displayHeightForContent,
  displaySizeFromMm,
  getSizeScalePreset,
  persistSizeScaleId,
  readStoredSizeScaleId,
  type ExportFormat,
  type ExportResolution,
  type SizeScaleId,
} from './deviceScale';
import {
  alignBox,
  artboardWidthCss,
  NO_GUIDES,
  snapPosition,
  stepViewZoom,
  viewZoomLabel,
  type AlignMode,
  type SnapGuides,
  type ViewZoom,
} from './artboardSnap';
import {
  bringForwardItems,
  bringToFrontItems,
  byZ,
  pushBackwardItems,
  reindexZ,
  selectedZRank,
  sendToBackItems,
} from './canvasZOrder';
import { downloadBlob, exportMockup } from './exportMockup';
import {
  getImageContentBounds,
  type ContentBounds,
} from './imageContentBounds';
import KeybindingsPanel from './KeybindingsPanel';
import LibraryPanel, {
  LIBRARY_W_MAX,
  LIBRARY_W_MIN,
} from './LibraryPanel';
import { matchesSearchQuery, sortBySearchRelevance } from './deviceMeta';
import {
  detectPlatform,
  formatChordForDisplay,
  loadBindingsForPlatform,
  type BindingMap,
} from './keybindings';
import StudioToolbar from './StudioToolbar';
import { useKeybindings } from './useKeybindings';
import { useTheme } from './useTheme';

const LIBRARY_W_KEY = 'mockupStudio.libraryWidth';
const LIBRARY_W_DEFAULT = 520;

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
}

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

function clientToLogical(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * ARTBOARD_WIDTH,
    y: ((clientY - rect.top) / rect.height) * ARTBOARD_HEIGHT,
  };
}

function readLibraryWidth(): number {
  try {
    const n = Number(localStorage.getItem(LIBRARY_W_KEY));
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
    localStorage.setItem(LIBRARY_W_KEY, String(w));
  } catch {
    // ignore
  }
}

function loadNativeSize(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export default function MockupStudio({ groupedLibrary }: MockupStudioProps) {
  const platform = useMemo(() => detectPlatform(), []);
  const { theme, toggleTheme } = useTheme();
  const [bindings, setBindings] = useState<BindingMap>(() =>
    loadBindingsForPlatform(platform),
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryWidth, setLibraryWidth] = useState(readLibraryWidth);
  const [viewZoom, setViewZoom] = useState<ViewZoom>('fit');
  const [snapGuides, setSnapGuides] = useState<SnapGuides>(NO_GUIDES);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const [placingPath, setPlacingPath] = useState<string | null>(null);
  const [layerHint, setLayerHint] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState({
    id: null as string | null,
    offsetX: 0,
    offsetY: 0,
  });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportResolution, setExportResolution] =
    useState<ExportResolution>('best');
  const [sizeScaleId, setSizeScaleId] = useState<SizeScaleId>(
    readStoredSizeScaleId,
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(
    null,
  );
  const statusTimer = useRef<number | null>(null);

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
      setCategoryFilter(categories[0]);
    }
  }, [categories, categoryFilter]);

  const categoryDevices = useMemo(() => {
    if (!effectiveCategory) return [] as DeviceItem[];
    return groupedLibrary[effectiveCategory] ?? [];
  }, [groupedLibrary, effectiveCategory]);

  const availableBrands = useMemo(() => {
    const set = new Set(categoryDevices.map((d) => d.brand));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categoryDevices]);

  const brandAll =
    selectedBrand == null || !availableBrands.includes(selectedBrand);

  const brandFilteredDevices = useMemo(() => {
    if (brandAll) return categoryDevices;
    return categoryDevices.filter((d) => d.brand === selectedBrand);
  }, [categoryDevices, brandAll, selectedBrand]);

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
    if (!effectiveCategory) {
      return [] as { category: string; items: DeviceItem[] }[];
    }
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
    return [{ category: effectiveCategory, items }];
  }, [
    effectiveCategory,
    brandFilteredDevices,
    selectedProductValid,
    searchQuery,
  ]);

  const zRank = useMemo(
    () => selectedZRank(canvasItems, selectedId),
    [canvasItems, selectedId],
  );
  const canBringForward =
    selectedId != null && zRank.index >= 0 && zRank.index < zRank.max;
  const canPushBackward = selectedId != null && zRank.index > 0;

  const handleAddAndSelect = async (item: DeviceItem) => {
    setPlacingPath(item.path);
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
    const { displayWidth, displayHeight } = applySizeScale(
      mmWidth,
      contentHeight,
      getSizeScalePreset(sizeScaleId).factor,
    );

    const instanceId = crypto.randomUUID();
    setCanvasItems((prev) => [
      ...prev,
      {
        ...item,
        instanceId,
        x: 50,
        y: 50,
        zIndex: prev.length,
        displayWidth,
        displayHeight,
        nativeWidth,
        nativeHeight,
        contentBounds,
      },
    ]);
    setSelectedId(instanceId);
    setPlacingPath(null);
    if (window.matchMedia('(max-width: 1024px)').matches) {
      setLibraryOpen(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const logical = clientToLogical(e.clientX, e.clientY, rect);
    setDragInfo({
      id: item.instanceId,
      offsetX: logical.x - item.x,
      offsetY: logical.y - item.y,
    });
    setSelectedId(item.instanceId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const logical = clientToLogical(e.clientX, e.clientY, rect);
    const dragging = canvasItems.find((i) => i.instanceId === dragInfo.id);
    if (!dragging) return;
    const { x, y, guides } = snapPosition(
      dragging,
      logical.x - dragInfo.offsetX,
      logical.y - dragInfo.offsetY,
    );
    setSnapGuides(guides);
    setCanvasItems((prev) =>
      prev.map((item) =>
        item.instanceId === dragInfo.id ? { ...item, x, y } : item,
      ),
    );
  };

  const handlePointerUp = () => {
    setDragInfo({ id: null, offsetX: 0, offsetY: 0 });
    setSnapGuides(NO_GUIDES);
  };

  const tryLayerAction = (kind: 'forward' | 'back') => {
    if (canvasItems.length < 2) {
      setLayerHint('Add another device to change layer order.');
      return;
    }
    if (kind === 'forward') {
      if (!canBringForward) return;
      setCanvasItems((prev) => {
        if (!selectedId) return prev;
        return bringForwardItems(prev, selectedId) ?? prev;
      });
    } else {
      if (!canPushBackward) return;
      setCanvasItems((prev) => {
        if (!selectedId) return prev;
        return pushBackwardItems(prev, selectedId) ?? prev;
      });
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

  const deleteSelected = () => {
    if (!selectedId) return;
    setCanvasItems((prev) =>
      reindexZ(byZ(prev.filter((item) => item.instanceId !== selectedId))),
    );
    setSelectedId(null);
  };

  const bringToFront = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => bringToFrontItems(prev, selectedId) ?? prev);
  };

  const sendToBack = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => sendToBackItems(prev, selectedId) ?? prev);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!selectedId) return;
    setCanvasItems((prev) =>
      prev.map((item) =>
        item.instanceId === selectedId
          ? { ...item, x: item.x + dx, y: item.y + dy }
          : item,
      ),
    );
  };

  const alignSelected = (mode: AlignMode) => {
    if (!selectedId) return;
    setCanvasItems((prev) =>
      prev.map((item) => {
        if (item.instanceId !== selectedId) return item;
        const next = alignBox(item, mode);
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
    if (!selectedId) return;
    setCanvasItems((prev) => {
      const source = prev.find((i) => i.instanceId === selectedId);
      if (!source) return prev;
      const instanceId = crypto.randomUUID();
      const clone: CanvasItem = {
        ...source,
        instanceId,
        x: source.x + 16,
        y: source.y + 16,
        zIndex: prev.length,
      };
      queueMicrotask(() => setSelectedId(instanceId));
      return reindexZ([...byZ(prev), clone]);
    });
  };

  const downloadCanvas = async () => {
    if (canvasItems.length === 0 || isExporting) return;
    setIsExporting(true);
    setSelectedId(null);
    setExportMenuOpen(false);
    try {
      const { blob, filenameHint } = await exportMockup(
        canvasItems.map((item) => ({
          src: item.src,
          x: item.x,
          y: item.y,
          zIndex: item.zIndex,
          displayWidth: item.displayWidth,
          displayHeight: item.displayHeight,
          nativeWidth: item.nativeWidth,
          nativeHeight: item.nativeHeight,
          contentBounds: item.contentBounds,
        })),
        { format: exportFormat, resolution: exportResolution },
        ARTBOARD_WIDTH,
        ARTBOARD_HEIGHT,
      );
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const ext = filenameHint.includes('.')
        ? filenameHint.slice(filenameHint.lastIndexOf('.'))
        : '.png';
      downloadBlob(blob, `mockup-${stamp}-${exportResolution}${ext}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Export failed');
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
        setToolsSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useKeybindings(
    bindings,
    {
      deleteSelected,
      deselect: () => setSelectedId(null),
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
      download: () => {
        void downloadCanvas();
      },
      openShortcuts: () => setShortcutsOpen(true),
    },
    { platform, enabled: !shortcutsOpen && !toolsSheetOpen },
  );

  const modHint = formatChordForDisplay('mod+s', platform);
  const forwardTitle = !selectedId
    ? 'Select a device first'
    : !canBringForward
      ? 'Already at front'
      : formatChordForDisplay(']', platform);
  const backTitle = !selectedId
    ? 'Select a device first'
    : !canPushBackward
      ? 'Already at back'
      : formatChordForDisplay('[', platform);

  return (
    <div
      className="ms-app"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (!t.closest('.ms-export-wrap')) setExportMenuOpen(false);
      }}
    >
      <header className="ms-topbar">
        <button type="button" className="ms-brand">
          Mockup Studio
        </button>
        <div className="ms-topbar-spacer" />
        <div className="ms-topbar-actions">
          <button
            type="button"
            className="ms-btn ms-btn--icon ms-library-toggle"
            onClick={() => setLibraryOpen(true)}
            aria-expanded={libraryOpen}
            aria-controls="ms-device-library"
            aria-label="Open device library"
          >
            <span className="ms-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <button
            type="button"
            className="ms-btn ms-btn--icon"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={
              theme === 'dark' ? 'Dark mode active' : 'Light mode active'
            }
            title={
              theme === 'dark'
                ? 'Dark mode (click for light)'
                : 'Light mode (click for dark)'
            }
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button
            type="button"
            className="ms-btn"
            onClick={() => setShortcutsOpen(true)}
            title={formatChordForDisplay('mod+/', platform)}
          >
            Shortcuts
          </button>
        </div>
      </header>

      <div className="ms-body">
        <div
          className={`ms-library-backdrop${libraryOpen ? ' is-open' : ''}`}
          onClick={() => setLibraryOpen(false)}
          aria-hidden={!libraryOpen}
        />

        <LibraryPanel
          open={libraryOpen}
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
          onClose={() => setLibraryOpen(false)}
          onCategoryChange={(c) => {
            setCategoryFilter(c);
            setSelectedProduct(null);
          }}
          onBrandAll={() => {
            setSelectedBrand(null);
            setSelectedProduct(null);
          }}
          onSelectBrand={(b) => {
            setSelectedBrand(b);
            setSelectedProduct(null);
          }}
          onSelectProduct={(p) =>
            setSelectedProduct((prev) => (prev === p ? null : p))
          }
          onSearchChange={setSearchQuery}
          onAddDevice={(item) => void handleAddAndSelect(item)}
          onResizePointerDown={onResizePointerDown}
          onResizePointerMove={onResizePointerMove}
          onResizePointerUp={onResizePointerUp}
        />

        <div className="ms-workspace">
          <StudioToolbar
            selectedId={selectedId}
            canBringForward={canBringForward}
            canPushBackward={canPushBackward}
            canvasEmpty={canvasItems.length === 0}
            isExporting={isExporting}
            exportFormat={exportFormat}
            exportResolution={exportResolution}
            exportMenuOpen={exportMenuOpen}
            toolsSheetOpen={toolsSheetOpen}
            sizeScaleId={sizeScaleId}
            forwardTitle={forwardTitle}
            backTitle={backTitle}
            modHint={modHint}
            duplicateTitle={formatChordForDisplay('mod+d', platform)}
            deleteTitle={`${formatChordForDisplay('delete', platform)} / ${formatChordForDisplay('backspace', platform)}`}
            layerHint={layerHint}
            statusMessage={statusMessage}
            onAlign={alignSelected}
            onBringForward={bringForward}
            onPushBackward={pushBackward}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onSizeScale={changeSizeScale}
            onExportFormat={setExportFormat}
            onExportResolution={setExportResolution}
            onToggleExportMenu={() => setExportMenuOpen((v) => !v)}
            onDownload={() => void downloadCanvas()}
            onToggleToolsSheet={() => setToolsSheetOpen((v) => !v)}
            onDismissLayerHint={() => setLayerHint(null)}
          />

          <div className="ms-stage">
            {canvasItems.length === 0 && (
              <div className="ms-stage-empty" aria-live="polite">
                <p className="ms-stage-empty-title">
                  Add a device from the library
                </p>
                <p className="ms-stage-empty-sub">
                  Filter by category, then click a device to place it on the
                  artboard.
                </p>
              </div>
            )}

            <div
              className="ms-view-zoom"
              role="group"
              aria-label="Artboard zoom"
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
                width: artboardWidthCss(viewZoom),
                aspectRatio: `${ARTBOARD_WIDTH} / ${ARTBOARD_HEIGHT}`,
              }}
              onClick={(e) => {
                if (e.target === canvasRef.current) setSelectedId(null);
              }}
            >
              {(snapGuides.vertical ||
                snapGuides.horizontal ||
                snapGuides.bottom) && (
                <div className="ms-snap-guides" aria-hidden="true">
                  {snapGuides.vertical && (
                    <div className="ms-snap-guide ms-snap-guide--v" />
                  )}
                  {snapGuides.horizontal && (
                    <div className="ms-snap-guide ms-snap-guide--h" />
                  )}
                  {snapGuides.bottom && (
                    <div className="ms-snap-guide ms-snap-guide--bottom" />
                  )}
                </div>
              )}
              {canvasItems.map((item) => (
                <div
                  key={item.instanceId}
                  role="img"
                  aria-label={item.name}
                  onPointerDown={(e) => handlePointerDown(e, item)}
                  className={[
                    'ms-canvas-item',
                    selectedId === item.instanceId
                      ? 'ms-canvas-item--selected'
                      : '',
                    dragInfo.id === item.instanceId
                      ? 'ms-canvas-item--grabbing'
                      : 'ms-canvas-item--grab',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${(item.x / ARTBOARD_WIDTH) * 100}%`,
                    top: `${(item.y / ARTBOARD_HEIGHT) * 100}%`,
                    width: `${(item.displayWidth / ARTBOARD_WIDTH) * 100}%`,
                    height: `${(item.displayHeight / ARTBOARD_HEIGHT) * 100}%`,
                    zIndex: item.zIndex,
                  }}
                >
                  <img
                    src={item.src}
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
              ))}
            </div>
          </div>
        </div>
      </div>

      <KeybindingsPanel
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        bindings={bindings}
        onBindingsChange={setBindings}
        platform={platform}
      />
    </div>
  );
}
