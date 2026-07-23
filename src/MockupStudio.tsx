import { useMemo, useRef, useState } from 'react';
import type { DeviceItem } from './App';
import {
  CATEGORY_ORDER,
  displayHeightFor,
  getDisplayWidth,
} from './deviceScale';
import { downloadBlob, exportMockupPng } from './exportMockup';

interface MockupStudioProps {
  groupedLibrary: Record<string, DeviceItem[]>;
}

interface CanvasItem extends DeviceItem {
  instanceId: string;
  x: number;
  y: number;
  zIndex: number;
  displayWidth: number;
  nativeWidth: number;
  nativeHeight: number;
}

type CategoryFilter = 'all' | string;

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
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState({
    id: null as string | null,
    offsetX: 0,
    offsetY: 0,
  });
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const present = new Set(Object.keys(groupedLibrary));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = Object.keys(groupedLibrary)
      .filter((c) => !CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number]))
      .sort();
    return [...ordered, ...extras];
  }, [groupedLibrary]);

  const filteredLibrary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result: { category: string; items: DeviceItem[] }[] = [];

    const cats =
      categoryFilter === 'all' ? categories : categories.filter((c) => c === categoryFilter);

    for (const category of cats) {
      const items = (groupedLibrary[category] ?? []).filter((item) => {
        if (!q) return true;
        return (item.name ?? '').toLowerCase().includes(q);
      });
      if (items.length > 0) {
        result.push({ category, items });
      }
    }
    return result;
  }, [groupedLibrary, categories, categoryFilter, searchQuery]);

  const handleAddAndSelect = async (item: DeviceItem) => {
    const displayWidth = getDisplayWidth(item.category);
    let nativeWidth = displayWidth;
    let nativeHeight = displayWidth * 2;

    try {
      const size = await loadNativeSize(item.src);
      nativeWidth = size.width;
      nativeHeight = size.height;
    } catch {
      // fallback
    }

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
        nativeWidth,
        nativeHeight,
      },
    ]);
    setSelectedId(instanceId);
  };

  const handlePointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDragInfo({
      id: item.instanceId,
      offsetX: e.clientX - rect.left - item.x,
      offsetY: e.clientY - rect.top - item.y,
    });
    setSelectedId(item.instanceId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - dragInfo.offsetX;
    const y = e.clientY - rect.top - dragInfo.offsetY;
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

  const downloadCanvas = async () => {
    if (!canvasRef.current || canvasItems.length === 0 || isExporting) return;

    setIsExporting(true);
    setSelectedId(null);

    try {
      const { width, height } = canvasRef.current.getBoundingClientRect();
      const blob = await exportMockupPng(
        canvasItems.map((item) => ({
          src: item.src,
          x: item.x,
          y: item.y,
          zIndex: item.zIndex,
          displayWidth: item.displayWidth,
          nativeWidth: item.nativeWidth,
          nativeHeight: item.nativeHeight,
        })),
        width,
        height,
      );
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      downloadBlob(blob, `mockup-${stamp}.png`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
        margin: '0 auto',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* LEFT PANEL: Library */}
      <div
        style={{
          width: '320px',
          borderRight: '1px solid #ccc',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f8f9fa',
          minHeight: 0,
        }}
      >
        <h2 style={{ padding: '12px 20px 8px', margin: 0 }}>Device Library</h2>

        <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <FilterChip
            label="All"
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          />
          {categories.map((category) => (
            <FilterChip
              key={category}
              label={category}
              active={categoryFilter === category}
              onClick={() => setCategoryFilter(category)}
            />
          ))}
        </div>

        <div style={{ padding: '0 12px 12px' }}>
          <input
            type="search"
            placeholder="Search devices…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filteredLibrary.length === 0 ? (
            <p style={{ padding: '0 20px', color: '#666', fontSize: '14px' }}>
              No devices match.
            </p>
          ) : (
            filteredLibrary.map(({ category, items }) => (
              <div key={category} style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    backgroundColor: '#e9ecef',
                    padding: '10px 20px',
                    margin: 0,
                    textTransform: 'capitalize',
                  }}
                >
                  {category}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '15px',
                    padding: '15px',
                  }}
                >
                  {items.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => handleAddAndSelect(item)}
                      style={{ cursor: 'pointer', textAlign: 'center' }}
                    >
                      <img
                        src={item.src}
                        alt={item.name}
                        style={{
                          width: '80px',
                          height: '80px',
                          objectFit: 'contain',
                        }}
                      />
                      <p
                        style={{
                          fontSize: '12px',
                          margin: '5px 0',
                          maxWidth: '80px',
                          wordWrap: 'break-word',
                        }}
                      >
                        {item.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Canvas & Controls */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#e0e0e0',
          minWidth: 0,
        }}
      >
        <div
          style={{
            height: '60px',
            backgroundColor: '#fff',
            borderBottom: '1px solid #ccc',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: '15px',
          }}
        >
          <button onClick={bringForward} disabled={!selectedId}>
            Bring Forward
          </button>
          <button onClick={pushBackward} disabled={!selectedId}>
            Push Backward
          </button>
          <button onClick={deleteSelected} disabled={!selectedId}>
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={downloadCanvas}
            disabled={canvasItems.length === 0 || isExporting}
            style={{
              backgroundColor:
                canvasItems.length === 0 || isExporting ? '#6c757d' : '#007bff',
              color: 'white',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              cursor:
                canvasItems.length === 0 || isExporting
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {isExporting ? 'Exporting…' : 'Download Mockup'}
          </button>
        </div>

        <div
          ref={canvasRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: 'transparent',
          }}
          onClick={(e) => {
            if (e.target === canvasRef.current) setSelectedId(null);
          }}
        >
          {canvasItems.map((item) => {
            const height = displayHeightFor(
              item.displayWidth,
              item.nativeWidth,
              item.nativeHeight,
            );
            return (
              <img
                key={item.instanceId}
                src={item.src}
                alt={item.name}
                draggable={false}
                onPointerDown={(e) => handlePointerDown(e, item)}
                style={{
                  position: 'absolute',
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.displayWidth}px`,
                  height: `${height}px`,
                  objectFit: 'contain',
                  zIndex: item.zIndex,
                  cursor:
                    dragInfo.id === item.instanceId ? 'grabbing' : 'grab',
                  outline:
                    selectedId === item.instanceId
                      ? '2px solid #007bff'
                      : 'none',
                  userSelect: 'none',
                }}
              />
            );
          })}
        </div>
      </div>
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
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: '999px',
        border: active ? '1px solid #007bff' : '1px solid #ccc',
        backgroundColor: active ? '#007bff' : '#fff',
        color: active ? '#fff' : '#333',
        cursor: 'pointer',
        fontSize: '12px',
        textTransform: 'capitalize',
      }}
    >
      {label}
    </button>
  );
}
