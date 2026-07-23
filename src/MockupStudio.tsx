import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceItem } from './App';
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  CATEGORY_ORDER,
  displaySizeFromMm,
  type ExportFormat,
  type ExportResolution,
} from './deviceScale';
import { downloadBlob, exportMockup } from './exportMockup';
import KeybindingsPanel from './KeybindingsPanel';
import { matchesSearchQuery, sortBySearchRelevance } from './deviceMeta';
import {
  detectPlatform,
  formatChordForDisplay,
  loadBindingsForPlatform,
  type BindingMap,
} from './keybindings';
import { useKeybindings } from './useKeybindings';
import { useTheme } from './useTheme';

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
}

function reindexZ(items: CanvasItem[]): CanvasItem[] {
  return [...items]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((item, index) => ({ ...item, zIndex: index }));
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

  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState({
    id: null as string | null,
    offsetX: 0,
    offsetY: 0,
  });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  /** null = Brand All */
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportResolution, setExportResolution] =
    useState<ExportResolution>('best');

  const canvasRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const present = new Set(Object.keys(groupedLibrary));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = Object.keys(groupedLibrary)
      .filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number]))
      .sort();
    return [...ordered, ...extras];
  }, [groupedLibrary]);

  /** Category list is always the full library set (Category-first). */
  const availableCategories = categories;

  const effectiveCategory =
    categoryFilter && availableCategories.includes(categoryFilter)
      ? categoryFilter
      : (availableCategories[0] ?? null);

  useEffect(() => {
    if (availableCategories.length === 0) {
      if (categoryFilter != null) setCategoryFilter(null);
      return;
    }
    if (
      categoryFilter == null ||
      !availableCategories.includes(categoryFilter)
    ) {
      setCategoryFilter(availableCategories[0]);
    }
  }, [availableCategories, categoryFilter]);

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

  const handleBrandAll = () => {
    setSelectedBrand(null);
    setSelectedProduct(null);
  };

  const handleSelectBrand = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedProduct(null);
  };

  const handleSelectProduct = (product: string) => {
    setSelectedProduct((prev) => (prev === product ? null : product));
  };

  const handleCategoryChange = (next: string) => {
    setCategoryFilter(next);
    setSelectedProduct(null);
    // Brand reset happens via effect if invalid for the new category
  };

  const handleAddAndSelect = async (item: DeviceItem) => {
    let nativeWidth = 100;
    let nativeHeight = 200;

    try {
      const size = await loadNativeSize(item.src);
      nativeWidth = size.width;
      nativeHeight = size.height;
    } catch {
      // fallback aspect until export loads the image
    }

    const { displayWidth, displayHeight } = displaySizeFromMm(
      item.widthMm,
      item.heightMm,
      {
        name: item.name,
        category: item.category,
        nativeWidth,
        nativeHeight,
      },
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
      },
    ]);
    setSelectedId(instanceId);
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
    const x = logical.x - dragInfo.offsetX;
    const y = logical.y - dragInfo.offsetY;
    setCanvasItems((prev) =>
      prev.map((item) =>
        item.instanceId === dragInfo.id ? { ...item, x, y } : item,
      ),
    );
  };

  const handlePointerUp = () => {
    setDragInfo({ id: null, offsetX: 0, offsetY: 0 });
  };

  const bringForward = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((i) => i.instanceId === selectedId);
      if (index < 0 || index >= sorted.length - 1) return prev;
      const next = [...sorted];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return reindexZ(next);
    });
  };

  const pushBackward = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((i) => i.instanceId === selectedId);
      if (index <= 0) return prev;
      const next = [...sorted];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return reindexZ(next);
    });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setCanvasItems((prev) =>
      reindexZ(prev.filter((item) => item.instanceId !== selectedId)),
    );
    setSelectedId(null);
  };

  const bringToFront = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((i) => i.instanceId === selectedId);
      if (index < 0 || index === sorted.length - 1) return prev;
      const [item] = sorted.splice(index, 1);
      sorted.push(item);
      return reindexZ(sorted);
    });
  };

  const sendToBack = () => {
    if (!selectedId) return;
    setCanvasItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((i) => i.instanceId === selectedId);
      if (index <= 0) return prev;
      const [item] = sorted.splice(index, 1);
      sorted.unshift(item);
      return reindexZ(sorted);
    });
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
      // Select after state update
      queueMicrotask(() => setSelectedId(instanceId));
      return reindexZ([...prev, clone]);
    });
  };

  const downloadCanvas = async () => {
    if (canvasItems.length === 0 || isExporting) return;

    setIsExporting(true);
    setSelectedId(null);

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
    { platform, enabled: !shortcutsOpen },
  );

  const modHint = formatChordForDisplay('mod+s', platform);

  return (
    <div
      className="ms-app"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
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
              theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
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

        <aside
          id="ms-device-library"
          className={`ms-library${libraryOpen ? ' is-open' : ''}`}
          aria-label="Device library"
        >
          <div className="ms-library-header">
            <h2 className="ms-library-title">Device Library</h2>
            <button
              type="button"
              className="ms-btn ms-btn--ghost ms-library-close"
              onClick={() => setLibraryOpen(false)}
              aria-label="Close library"
            >
              Close
            </button>
          </div>

          {availableCategories.length > 0 && (
            <div className="ms-filter-block">
              <div className="ms-filter-label">Category</div>
              <div className="ms-chip-row">
                {availableCategories.map((category) => (
                  <FilterChip
                    key={category}
                    label={category}
                    active={effectiveCategory === category}
                    onClick={() => handleCategoryChange(category)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="ms-filter-block">
            <div className="ms-filter-label">Brand</div>
            <div className="ms-chip-row">
              <FilterChip
                label="All"
                active={brandAll}
                onClick={handleBrandAll}
              />
              {availableBrands.map((brand) => (
                <FilterChip
                  key={brand}
                  label={brand}
                  active={!brandAll && selectedBrand === brand}
                  onClick={() => handleSelectBrand(brand)}
                />
              ))}
            </div>
          </div>

          <div className="ms-filter-block">
            <div className="ms-filter-label">Product</div>
            <div className="ms-chip-row">
              {availableProducts.map((product) => (
                <FilterChip
                  key={product}
                  label={product}
                  active={selectedProductValid === product}
                  onClick={() => handleSelectProduct(product)}
                />
              ))}
            </div>
          </div>

          <div className="ms-filter-block">
            <input
              className="ms-search"
              type="search"
              placeholder="Search (e.g. iphone 11 pro, macbook air)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search devices"
            />
          </div>

          <div className="ms-library-results">
            {filteredLibrary.length === 0 ? (
              <p className="ms-empty">No devices match.</p>
            ) : (
              filteredLibrary.map(({ category, items }) => (
                <div key={category} className="ms-device-section">
                  <h3 className="ms-device-section-title">{category}</h3>
                  <div className="ms-device-grid">
                    {items.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        className="ms-device-tile"
                        onClick={() => void handleAddAndSelect(item)}
                      >
                        <img src={item.src} alt="" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="ms-workspace">
          <div className="ms-toolbar">
            <div className="ms-toolbar-group">
              <span className="ms-toolbar-label">Arrange</span>
              <button
                type="button"
                className="ms-btn"
                onClick={bringForward}
                disabled={!selectedId}
                title={formatChordForDisplay(']', platform)}
              >
                Forward
              </button>
              <button
                type="button"
                className="ms-btn"
                onClick={pushBackward}
                disabled={!selectedId}
                title={formatChordForDisplay('[', platform)}
              >
                Back
              </button>
              <button
                type="button"
                className="ms-btn"
                onClick={duplicateSelected}
                disabled={!selectedId}
                title={formatChordForDisplay('mod+d', platform)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="ms-btn ms-btn--danger"
                onClick={deleteSelected}
                disabled={!selectedId}
                title={`${formatChordForDisplay('delete', platform)} / ${formatChordForDisplay('backspace', platform)}`}
              >
                Delete
              </button>
            </div>

            <div className="ms-toolbar-spacer" />

            <div className="ms-toolbar-group">
              <span className="ms-toolbar-label">Export</span>
              <label className="ms-field">
                Format
                <select
                  className="ms-select"
                  value={exportFormat}
                  onChange={(e) =>
                    setExportFormat(e.target.value as ExportFormat)
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </label>
              <label className="ms-field">
                Resolution
                <select
                  className="ms-select"
                  value={exportResolution}
                  onChange={(e) =>
                    setExportResolution(e.target.value as ExportResolution)
                  }
                >
                  <option value="best">Best</option>
                  <option value="1440p">1440p</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <button
                type="button"
                className="ms-btn ms-btn--primary"
                onClick={() => void downloadCanvas()}
                disabled={canvasItems.length === 0 || isExporting}
                title={modHint}
              >
                {isExporting ? 'Exporting…' : 'Download'}
              </button>
            </div>
          </div>

          <div className="ms-stage">
            <div
              ref={canvasRef}
              className="ms-artboard"
              style={{
                width: `min(100cqw, ${ARTBOARD_WIDTH}px, calc(100cqh * ${ARTBOARD_WIDTH} / ${ARTBOARD_HEIGHT}))`,
                aspectRatio: `${ARTBOARD_WIDTH} / ${ARTBOARD_HEIGHT}`,
              }}
              onClick={(e) => {
                if (e.target === canvasRef.current) setSelectedId(null);
              }}
            >
              {canvasItems.map((item) => (
                <img
                  key={item.instanceId}
                  src={item.src}
                  alt={item.name}
                  draggable={false}
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
                />
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ms-chip"
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
