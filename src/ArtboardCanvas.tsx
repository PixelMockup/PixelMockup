import type { CanvasItem } from './MockupStudio';
import type { DeviceItem } from './App';
import { useLongPress } from './useLongPress';
import { LIBRARY_DRAG_MIME } from './LibraryPanel';
import { clientToLogical } from './clientToLogical';
import { artboardWidthCss, type SnapGuides, type ViewZoom } from './artboardSnap';
import CanvasItemView from './CanvasItemView';
import SnapGuidesOverlay from './SnapGuidesOverlay';
import panzoom from 'panzoom';
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
}: ArtboardCanvasProps) {
  const pzRef = useRef<any>(null);
  const viewZoomRef = useRef(viewZoom);
  viewZoomRef.current = viewZoom;
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
    el.style.touchAction = 'none';
    const instance = panzoom(el, {
      maxScale: 1.75,
      minScale: 0.5,
      step: 0.25,
      disablePan: false,
      disableZoom: false,
      cursor: 'grab',
      contain: 'outside',
      touchAction: 'none',
      // Capture pointer events on child elements by setting on wrapper via CSS
    });
    pzRef.current = instance;
    const originalStyle = el.getAttribute('style') || '';
    el.style.touchAction = 'none';
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      const current = Number(viewZoomRef.current || 1);
      const next = Math.max(0.25, Math.min(1.75, current + delta));
      const nearest = [0.5, 1, 1.25, 1.5, 1.75].reduce((a, b) => (Math.abs(a - next) < Math.abs(b - next) ? a : b));
      if (onViewZoom) onViewZoom(nearest as ViewZoom);
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      instance.dispose();
        el.removeEventListener('wheel', onWheel);
      el.setAttribute('style', originalStyle);
    };
  }, [canvasRef, onViewZoom]);

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
