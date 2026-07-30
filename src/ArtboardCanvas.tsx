import type { CanvasItem } from './MockupStudio';
import type { DeviceItem } from './App';
import { useLongPress } from './useLongPress';
import { LIBRARY_DRAG_MIME } from './LibraryPanel';
import { clientToLogical } from './clientToLogical';
import { artboardWidthCss, type SnapGuides, type ViewZoom } from './artboardSnap';
import CanvasItemView from './CanvasItemView';
import SnapGuidesOverlay from './SnapGuidesOverlay';

type ArtboardCanvasProps = {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewZoom: ViewZoom;
  artboardW: number;
  artboardH: number;
  snapGuides: SnapGuides;
  canvasItems: CanvasItem[];
  selectedIdSet: Set<string>;
  hoveredId: string | null;
  dragInfo: { groupIds: string[] };
  screenDrag: { id: string } | null;
  websiteUrl: string | null;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setHoveredId: React.Dispatch<React.SetStateAction<string | null>>;
  openContextMenu: (
    e: React.MouseEvent | React.PointerEvent,
    target: 'artboard' | 'device',
    item?: CanvasItem,
  ) => void;
  handlePointerDown: (e: React.PointerEvent, item: CanvasItem) => void;
  handleScreenPointerDown: (e: React.PointerEvent, item: CanvasItem) => void;
  handleAddAndSelect: (
    item: DeviceItem,
    at?: { x: number; y: number },
  ) => Promise<void>;
  findDeviceByPath: (path: string) => DeviceItem | undefined;
};

export default function ArtboardCanvas({
  canvasRef,
  viewZoom,
  artboardW,
  artboardH,
  snapGuides,
  canvasItems,
  selectedIdSet,
  hoveredId,
  dragInfo,
  screenDrag,
  websiteUrl,
  setSelectedIds,
  setHoveredId,
  openContextMenu,
  handlePointerDown,
  handleScreenPointerDown,
  handleAddAndSelect,
  findDeviceByPath,
}: ArtboardCanvasProps) {
  const onClickBackground = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedIds([]);
    }
  };

  const canvasLongPress = useLongPress(
    (e) => {
      if (e.target === canvasRef.current) {
        openContextMenu(e, 'artboard');
      }
    },
    { delay: 500 },
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedIds([]);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const t = e.target as HTMLElement;
    if (t.closest('.ms-canvas-item')) return;
    openContextMenu(e, 'artboard');
  };

  const onDragOver = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(LIBRARY_DRAG_MIME) ||
      e.dataTransfer.types.includes('text/plain')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: React.DragEvent) => {
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
    void handleAddAndSelect(device, { x: logical.x, y: logical.y });
  };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {/* NOSONAR - custom interactive application canvas with explicit keyboard handling (Escape) */}
      <div
        ref={canvasRef}
        className="ms-artboard"
        role="application"
        aria-label="Artboard canvas"
        tabIndex={0}
        style={{
          width: artboardWidthCss(viewZoom, {
            width: artboardW,
            height: artboardH,
          }),
          aspectRatio: `${artboardW} / ${artboardH}`,
        }}
        onClick={onClickBackground}
        onKeyDown={onKeyDown}
        onPointerDown={canvasLongPress.onPointerDown}
        onPointerUp={canvasLongPress.onPointerUp}
        onPointerMove={canvasLongPress.onPointerMove}
        onPointerLeave={canvasLongPress.onPointerLeave}
        onContextMenu={(e) => {
          canvasLongPress.onContextMenu(e);
          onContextMenu(e);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
      <SnapGuidesOverlay
        snapGuides={snapGuides}
        artboardW={artboardW}
        artboardH={artboardH}
      />
      {canvasItems.map((item) => (
        <CanvasItemView
          key={item.instanceId}
          item={item}
          isSelected={selectedIdSet.has(item.instanceId)}
          isHovered={hoveredId === item.instanceId}
          isGrabbing={dragInfo.groupIds.includes(item.instanceId)}
          artboardW={artboardW}
          artboardH={artboardH}
          websiteUrl={websiteUrl}
          screenDrag={screenDrag}
          onPointerDown={handlePointerDown}
          onContextMenu={(e, item) => openContextMenu(e, 'device', item)}
          onScreenPointerDown={handleScreenPointerDown}
          onHoverStart={setHoveredId}
          onHoverEnd={(id) =>
            setHoveredId((current) => (current === id ? null : current))
          }
        />
      ))}
    </div>
  </>
  );
}
