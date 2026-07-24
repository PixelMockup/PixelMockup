import type { DeviceItem } from './App';
import { formatDeviceDisplayName } from './deviceMeta';

const PRODUCT_CHIP_PREVIEW = 8;
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
}: LibraryPanelProps) {
  const preview = availableProducts.slice(0, PRODUCT_CHIP_PREVIEW);
  const hiddenCount = Math.max(0, availableProducts.length - PRODUCT_CHIP_PREVIEW);
  const showMore = availableProducts.length > PRODUCT_CHIP_PREVIEW;
  const hasActiveFilters =
    !brandAll || selectedProductValid != null || searchQuery.trim().length > 0;

  return (
    <aside
      id="ms-device-library"
      className={`ms-library${open ? ' is-open' : ''}`}
      aria-label="Device library"
      style={{ width }}
    >
      <div className="ms-library-header">
        <h2 className="ms-library-title">Device Library</h2>
        <button
          type="button"
          className="ms-btn ms-btn--ghost ms-library-close"
          onClick={onClose}
          aria-label="Close library"
        >
          Close
        </button>
      </div>

      {categories.length > 0 && (
        <div className="ms-filter-block">
          <div className="ms-filter-label">Category</div>
          <div className="ms-chip-row">
            {categories.map((category) => (
              <FilterChip
                key={category}
                label={category}
                active={!searchIsGlobal && effectiveCategory === category}
                onClick={() => onCategoryChange(category)}
              />
            ))}
          </div>
          {searchIsGlobal && (
            <p className="ms-filter-hint">Searching all categories</p>
          )}
        </div>
      )}

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
                role="dialog"
                aria-label="More products"
              >
                <div className="ms-chip-row">
                  {availableProducts.slice(PRODUCT_CHIP_PREVIEW).map((product) => (
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

      <div className="ms-filter-block">
        <input
          className="ms-search"
          type="search"
          placeholder="Search all devices (e.g. macbook air)…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search devices"
        />
      </div>

      <div className="ms-library-results">
        {filteredLibrary.length === 0 ? (
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
          filteredLibrary.map(({ category, items }) => (
            <div key={category} className="ms-device-section">
              <h3 className="ms-device-section-title">{category}</h3>
              <div className="ms-device-grid">
                {items.map((item) => {
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
                      title={`${label} — click or drag to artboard`}
                      draggable={placingPath == null}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(LIBRARY_DRAG_MIME, item.path);
                        e.dataTransfer.setData('text/plain', item.path);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => onAddDevice(item)}
                    >
                      <img src={item.src} alt="" draggable={false} />
                      <span>{placing ? 'Placing…' : label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        className="ms-library-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize device library"
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
