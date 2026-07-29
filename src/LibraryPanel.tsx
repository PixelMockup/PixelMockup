import { useState, type RefObject } from 'react';
import type { DeviceItem } from './App';
import { formatDeviceDisplayName } from './deviceMeta';

const PRODUCT_CHIP_PREVIEW = 8;
const INITIAL_VISIBLE_ITEMS = 50;
const LIBRARY_DRAG_MIME = 'application/x-mockup-device';

export const LIBRARY_W_MIN = 280;
export const LIBRARY_W_MAX = 720;

export { LIBRARY_DRAG_MIME };

interface LibraryPanelProps {
  open: boolean;
  width: number;
  categories: string[];
  effectiveCategory: string | null;
  availableBrands: string[];
  brandAll: boolean;
  selectedBrand: string | null;
  availableProducts: string[];
  selectedProductValid: string | null;
  searchQuery: string;
  filteredLibrary: { category: string; items: DeviceItem[] }[];
  placingPath: string | null;
  searchIsGlobal: boolean;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  libraryLoading: boolean;
  libraryProgress: number;
  loadedCategories: Set<string>;
  onClose: () => void;
  onCategoryChange: (category: string) => void;
  onBrandAll: () => void;
  onSelectBrand: (brand: string) => void;
  onProductAll: () => void;
  onSelectProduct: (product: string) => void;
  onSearchChange: (query: string) => void;
  onClearFilters: () => void;
  onAddDevice: (item: DeviceItem) => void;
  onResizePointerDown: (e: React.PointerEvent) => void;
  onResizePointerMove: (e: React.PointerEvent) => void;
  onResizePointerUp: () => void;
}

function FilterChip({
  label,
  active,
  loading,
  title: chipTitle,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly loading?: boolean;
  readonly title?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ms-chip${loading ? ' ms-chip--loading' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-busy={loading}
      title={chipTitle}
    >
      {label}
    </button>
  );
}

export default function LibraryPanel({
  open,
  width,
  categories,
  effectiveCategory,
  availableBrands,
  brandAll,
  selectedBrand,
  availableProducts,
  selectedProductValid,
  searchQuery,
  filteredLibrary,
  placingPath,
  searchIsGlobal,
  searchInputRef,
  libraryLoading,
  libraryProgress,
  loadedCategories,
  onClose,
  onCategoryChange,
  onBrandAll,
  onSelectBrand,
  onProductAll,
  onSelectProduct,
  onSearchChange,
  onClearFilters,
  onAddDevice,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: Readonly<LibraryPanelProps>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const preview = availableProducts.slice(0, PRODUCT_CHIP_PREVIEW);
  const hiddenCount = Math.max(0, availableProducts.length - PRODUCT_CHIP_PREVIEW);
  const showMore = availableProducts.length > PRODUCT_CHIP_PREVIEW;
  const hasActiveFilters =
    !brandAll || selectedProductValid != null || searchQuery.trim().length > 0;

  return (
    <aside
      id="ms-device-library"
      className={`ms-library${open ? ' is-open' : ''}`}
      aria-label="Devices"
      style={{ width }}
    >
      <div className="ms-library-header">
        <h2 className="ms-library-title">Devices</h2>
        <button
          type="button"
          className="ms-btn ms-btn--ghost ms-library-close"
          onClick={onClose}
          aria-label="Close devices"
        >
          Close
        </button>
      </div>

      {libraryLoading && (
        <div className="ms-library-progress" aria-live="polite">
          <div
            className="ms-library-progress-bar"
            style={{ width: `${libraryProgress}%` }}
            aria-hidden="true"
          />
          <span className="ms-library-progress-label">
            {libraryProgress > 0
              ? `Loading devices… ${Math.round(libraryProgress)}%`
              : 'Loading devices…'}
          </span>
        </div>
      )}

      <div className="ms-filter-block ms-filter-block--search">
        <input
          ref={searchInputRef}
          className="ms-search"
          type="search"
          placeholder="Search devices (e.g. iphone)…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search devices"
        />
      </div>

      {categories.length > 0 && (
        <div className="ms-filter-block">
          <div className="ms-filter-label">Category</div>
          <div className="ms-chip-row">
            {categories.map((category) => {
              const loaded = loadedCategories.has(category);
              return (
                <FilterChip
                  key={category}
                  label={category}
                  active={!searchIsGlobal && effectiveCategory === category}
                  loading={!loaded}
                  title={loaded ? category : `${category} — click to load`}
                  onClick={() => onCategoryChange(category)}
                />
              );
            })}
          </div>
          {searchIsGlobal && (
            <p className="ms-filter-hint">Searching all categories</p>
          )}
        </div>
      )}

      <div className="ms-filter-block">
        <button
          type="button"
          className="ms-btn ms-btn--ghost ms-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
          {hasActiveFilters && !filtersOpen ? ' · on' : ''}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={onClearFilters}
          >
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <>
          <div className="ms-filter-block">
            <div className="ms-filter-label">Brand</div>
            <div className="ms-chip-row">
              <FilterChip label="All" active={brandAll} onClick={onBrandAll} />
              {availableBrands.map((brand) => (
                <FilterChip
                  key={brand}
                  label={brand}
                  active={!brandAll && selectedBrand === brand}
                  onClick={() => onSelectBrand(brand)}
                />
              ))}
            </div>
          </div>

          <div className="ms-filter-block ms-filter-block--products">
            <div className="ms-filter-label">Product</div>
            <div className="ms-chip-row">
              <FilterChip
                label="All"
                active={selectedProductValid == null}
                onClick={onProductAll}
              />
              {preview.map((product) => (
                <FilterChip
                  key={product}
                  label={product}
                  active={selectedProductValid === product}
                  onClick={() => onSelectProduct(product)}
                />
              ))}
              {showMore && (
                <details className="ms-product-more">
                  <summary className="ms-chip ms-chip--more">
                    More… (+{hiddenCount})
                  </summary>
                  <div
                    className="ms-product-popover"
                    aria-label="More products"
                  >
                    <div className="ms-chip-row">
                      {availableProducts
                        .slice(PRODUCT_CHIP_PREVIEW)
                        .map((product) => (
                          <FilterChip
                            key={product}
                            label={product}
                            active={selectedProductValid === product}
                            onClick={() => onSelectProduct(product)}
                          />
                        ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          </div>
        </>
      )}

      <div className="ms-library-results">
        {filteredLibrary.length === 0 &&
        effectiveCategory != null &&
        !loadedCategories.has(effectiveCategory) ? (
          <div className="ms-empty-block">
            <p className="ms-empty">Loading {effectiveCategory}…</p>
          </div>
        ) : filteredLibrary.length === 0 ? (
          <div className="ms-empty-block">
            <p className="ms-empty">No devices match.</p>
            {hasActiveFilters && (
              <button
                type="button"
                className="ms-btn"
                onClick={onClearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredLibrary.map(({ category, items }) => {
            const expanded =
              searchIsGlobal ||
              expandedSections.has(category) ||
              items.length <= INITIAL_VISIBLE_ITEMS;
            const visibleItems = expanded
              ? items
              : items.slice(0, INITIAL_VISIBLE_ITEMS);
            const hiddenCount = items.length - visibleItems.length;
            return (
              <div key={category} className="ms-device-section">
                <h3 className="ms-device-section-title">{category}</h3>
                <div className="ms-device-grid">
                  {visibleItems.map((item) => {
                    const placing = placingPath === item.path;
                    const label = formatDeviceDisplayName(item.name);
                    return (
                      <button
                        key={item.path}
                        type="button"
                        className="ms-device-tile"
                        disabled={placingPath != null}
                        aria-busy={placing}
                        aria-label={label}
                        title={`${label} — click or drag onto the canvas`}
                        draggable={placingPath == null}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(LIBRARY_DRAG_MIME, item.path);
                          e.dataTransfer.setData('text/plain', item.path);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onAddDevice(item)}
                      >
                        <img
                          src={item.src}
                          alt=""
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                        />
                        <span>{placing ? 'Placing…' : label}</span>
                      </button>
                    );
                  })}
                </div>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="ms-btn ms-btn--ghost ms-library-load-more"
                    onClick={() =>
                      setExpandedSections((prev) => {
                        const next = new Set(prev);
                        next.add(category);
                        return next;
                      })
                    }
                  >
                    Load {hiddenCount} more
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div
        className="ms-library-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize devices panel"
        aria-valuemin={LIBRARY_W_MIN}
        aria-valuemax={LIBRARY_W_MAX}
        aria-valuenow={Math.round(width)}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      >
        <span className="ms-library-resizer-grip" aria-hidden="true" />
      </div>
    </aside>
  );
}
