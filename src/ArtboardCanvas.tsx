import type { CanvasItem } from './MockupStudio';
import type { DeviceItem } from './App';
import { useLongPress } from './useLongPress';
import { LIBRARY_DRAG_MIME } from './LibraryPanel';
import { clientToLogical } from './clientToLogical';
import { artboardWidthCss, clampViewZoom, type SnapGuides, type ViewZoom } from './artboardSnap';
import CanvasItemView from './CanvasItemView';
import SnapGuidesOverlay from './SnapGuidesOverlay';
import { useEffect, useRef } from 'react';
import type { CaptureNotice } from './captureWebsite';
import { updateMockupConnectors } from './components/MockupConnector';

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
  onWebsiteCaptureFailed?: (notice: CaptureNotice) => void;
  onWebsiteCaptureDetails?: (notice: CaptureNotice) => void;
  onSwitchToIframePreview?: () => void;
  onViewZoom?: (v: ViewZoom) => void;
  onLiveScale?: (s: number) => void;
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
  onWebsiteCaptureFailed,
  onWebsiteCaptureDetails,
  onViewZoom,
  onLiveScale,
}: ArtboardCanvasProps) {
  const viewZoomRef = useRef(viewZoom);
  const onViewZoomRef = useRef(onViewZoom);
  const pinchRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    initialDistance: 0,
    initialZoom: 1,
  });
  viewZoomRef.current = viewZoom;
  onViewZoomRef.current = onViewZoom;
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

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handleMove = () => updateMockupConnectors();
    el.addEventListener('pointermove', handleMove);
    return () => el.removeEventListener('pointermove', handleMove);
  }, [canvasRef]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !onViewZoom) return;

    // Block browser default zoom globally (Ctrl+wheel anywhere in the page)
    const browserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener('wheel', browserZoom, { passive: false });

    // getting numeric zoom from ViewZoom
    const getNumericZoom = (): number => {
      const z = viewZoomRef.current;
      if (typeof z === 'number') return z;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 ? rect.width / artboardW : 1;
    };

    // Desktop: Ctrl + wheel → zoom canvas
    const ZOOM_STEP = 0.;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const current = getNumericZoom();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const next = clampViewZoom(current * factor);
      onViewZoomRef.current?.(next);
      if (onLiveScale) onLiveScale(next);
    };

    // Mobile: 2 finger pinch → zoom canvas
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pinchRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current.pointers.size === 2) {
        const [p1, p2] = [...pinchRef.current.pointers.values()];
        pinchRef.current.initialDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        pinchRef.current.initialZoom = getNumericZoom();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!pinchRef.current.pointers.has(e.pointerId)) return;
      pinchRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current.pointers.size === 2) {
        e.preventDefault(); // block browser pinch-zoom
        const [p1, p2] = [...pinchRef.current.pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (pinchRef.current.initialDistance < 10) return;
        const scale = dist / pinchRef.current.initialDistance;
        const next = clampViewZoom(
          Math.round((pinchRef.current.initialZoom * scale) / ZOOM_STEP) * ZOOM_STEP
        );
        onViewZoomRef.current?.(next);
        if (onLiveScale) onLiveScale(next);
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pinchRef.current.pointers.delete(e.pointerId);
      if (pinchRef.current.pointers.size < 2) {
        pinchRef.current.initialDistance = 0;
      }
    };

    // Attach instances
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('pointerleave', endPointer);

    return () => {
      document.removeEventListener('wheel', browserZoom);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('pointerleave', endPointer);
    };
  }, [canvasRef, artboardW]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        if (onViewZoom) onViewZoom(Math.min(4, (Number(viewZoom) || 1) + 0.25) as ViewZoom);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        if (onViewZoom) onViewZoom(Math.max(0.25, (Number(viewZoom) || 1) - 0.25) as ViewZoom);
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (onViewZoom) onViewZoom('fit');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewZoom, onViewZoom]);

  return (
    <div
      className="ms-stage__canvas"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        userSelect: 'none',
        overscrollBehavior: 'none',
      }}
    >
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
            transformOrigin: '0 0',
            position: 'relative',
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
              onWebsiteCaptureFailed={onWebsiteCaptureFailed}
              onWebsiteCaptureDetails={onWebsiteCaptureDetails}
            />
          ))}
        </div>
      </>
    </div>
  );


}
