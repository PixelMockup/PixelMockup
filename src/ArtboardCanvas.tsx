import type { CanvasItem } from "./MockupStudio";
import type { DeviceItem } from "./App";
import { useLongPress } from "./useLongPress";
import { LIBRARY_DRAG_MIME } from "./LibraryPanel";
import { clientToLogical } from "./clientToLogical";
import {
  artboardWidthCss,
  clampViewZoom,
  type SnapGuides,
  type ViewZoom,
} from "./artboardSnap";
import CanvasItemView from "./CanvasItemView";
import SnapGuidesOverlay from "./SnapGuidesOverlay";
import { useEffect, useRef } from "react";
import type { CaptureNotice } from "./captureWebsite";
import { updateMockupConnectors } from "./components/MockupConnector";

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
    target: "artboard" | "device",
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
  pan?: { panX: number; panY: number };
  onPan?: (p: { panX: number; panY: number }) => void;
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
  pan,
  onPan,
}: ArtboardCanvasProps) {
  const viewZoomRef = useRef(viewZoom);
  const onViewZoomRef = useRef(onViewZoom);
  const pinchRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    initialDistance: 0,
    initialZoom: 1,
  });
  const panMoveRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    prevX: 0,
    prevY: 0,
    active: false,
  });
  const prevCentroidRef = useRef({ x: 0, y: 0, id: -1 });
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
        openContextMenu(e, "artboard");
      }
    },
    { delay: 500 },
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedIds([]);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const t = e.target as HTMLElement;
    if (t.closest(".ms-canvas-item")) return;
    openContextMenu(e, "artboard");
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handleMove = () => updateMockupConnectors();
    el.addEventListener("pointermove", handleMove);
    return () => el.removeEventListener("pointermove", handleMove);
  }, [canvasRef]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !onViewZoom) return;

    // Block browser default zoom globally (Ctrl+wheel anywhere in the page)
    const browserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener("wheel", browserZoom, { passive: false });

    // getting numeric zoom from ViewZoom
    const getNumericZoom = (): number => {
      const z = viewZoomRef.current;
      if (typeof z === "number") return z;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 ? rect.width / artboardW : 1;
    };

    // Desktop: Ctrl + wheel → zoom canvas
    const ZOOM_STEP = 0.01; // was 0 — divide-by-zero in pinch math
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const current = getNumericZoom();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const next = clampViewZoom(current * factor);
        onViewZoomRef.current?.(next);
        if (onLiveScale) onLiveScale(next);
        if (viewZoomRef.current === "fit" && onPan) {
          onPan({ panX: 0, panY: 0 });
        }
        return;
      }
      // Desktop pan (Figma-style) — natural direction
      e.preventDefault();
      const scale = getNumericZoom();
      const dx = (e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX) / scale;
      const dy = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) / scale;
      if (onPan) {
        onPan({ panX: (pan?.panX ?? 0) + dx, panY: (pan?.panY ?? 0) + dy });
      }
      if (viewZoomRef.current === "fit" && onViewZoomRef.current) {
        const numeric = getNumericZoom();
        onViewZoomRef.current(numeric as ViewZoom);
        if (onLiveScale) onLiveScale(numeric);
      }
    };

    // Mobile: 2 finger pinch → zoom canvas
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pinchRef.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      if (pinchRef.current.pointers.size === 2) {
        prevCentroidRef.current = { x: 0, y: 0, id: -1 };
        const [p1, p2] = [...pinchRef.current.pointers.values()];
        pinchRef.current.initialDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        pinchRef.current.initialZoom = getNumericZoom();
      } else if (pinchRef.current.pointers.size === 1) {
        panMoveRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          prevX: e.clientX,
          prevY: e.clientY,
          active: false,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (!pinchRef.current.pointers.has(e.pointerId)) return;
      pinchRef.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      if (pinchRef.current.pointers.size === 2) {
        prevCentroidRef.current = { x: 0, y: 0, id: -1 };
        e.preventDefault(); // block browser pinch-zoom
        const [p1, p2] = [...pinchRef.current.pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        // Centroid pan
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        if (prevCentroidRef.current.id !== -1) {
          const dx = cx - prevCentroidRef.current.x;
          const dy = cy - prevCentroidRef.current.y;
          if (onPan) {
            const scale = getNumericZoom();
            onPan({
              panX: (pan?.panX ?? 0) + dx / scale,
              panY: (pan?.panY ?? 0) + dy / scale,
            });
          }
        }
        prevCentroidRef.current = { x: cx, y: cy, id: 1 };
        if (viewZoomRef.current === "fit" && onViewZoomRef.current) {
          const numeric = getNumericZoom();
          onViewZoomRef.current(numeric as ViewZoom);
          if (onLiveScale) onLiveScale(numeric);
        }
        if (pinchRef.current.initialDistance < 10) return;
        const scale = dist / pinchRef.current.initialDistance;
        const next = clampViewZoom(
          Math.round((pinchRef.current.initialZoom * scale) / ZOOM_STEP) *
            ZOOM_STEP,
        );
        onViewZoomRef.current?.(next);
        if (onLiveScale) onLiveScale(next);
      } else if (pinchRef.current.pointers.size === 1) {
        const panLocal = panMoveRef.current;
        if (panLocal.pointerId === e.pointerId) {
          const dx = e.clientX - panLocal.prevX;
          const dy = e.clientY - panLocal.prevY;
          const dist = Math.hypot(dx, dy);
          if (!panLocal.active && dist > 8) {
            panLocal.active = true;
            // long-press abort handled by useLongPress at >8px automatically
          }
          if (panLocal.active) {
            e.preventDefault(); // only when pan active
            const scale = getNumericZoom();
            if (onPan) {
              onPan({
                panX: (pan?.panX ?? 0) + dx / scale,
                panY: (pan?.panY ?? 0) + dy / scale,
              });
            }
            if (viewZoomRef.current === "fit" && onViewZoomRef.current) {
              const numeric = getNumericZoom();
              onViewZoomRef.current(numeric as ViewZoom);
              if (onLiveScale) onLiveScale(numeric);
            }
          }
          panLocal.prevX = e.clientX;
          panLocal.prevY = e.clientY;
        }
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const wasTwo = pinchRef.current.pointers.size === 2;
      pinchRef.current.pointers.delete(e.pointerId);
      if (pinchRef.current.pointers.size < 2) {
        pinchRef.current.initialDistance = 0;
      }
      // Continue single-finger pan with remaining pointer
      if (wasTwo && pinchRef.current.pointers.size === 1 && onPan) {
        prevCentroidRef.current = { x: 0, y: 0, id: -1 };
        const [rem] = [...pinchRef.current.pointers.values()];
        // We don't have pointerId from value; find by remaining key
        const remId = [...pinchRef.current.pointers.keys()][0];
        panMoveRef.current = {
          pointerId: remId,
          startX: rem.x,
          startY: rem.y,
          prevX: rem.x,
          prevY: rem.y,
          active: true,
        };
        prevCentroidRef.current = { x: rem.x, y: rem.y, id: -1 };
      }
      if (pinchRef.current.pointers.size === 0) {
        panMoveRef.current = {
          pointerId: -1,
          startX: 0,
          startY: 0,
          prevX: 0,
          prevY: 0,
          active: false,
        };
        prevCentroidRef.current = { x: 0, y: 0, id: -1 };
      }
    };

    // Attach instances
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    el.addEventListener("pointerleave", endPointer);

    return () => {
      document.removeEventListener("wheel", browserZoom);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPointer);
      el.removeEventListener("pointercancel", endPointer);
      el.removeEventListener("pointerleave", endPointer);
    };
  }, [canvasRef, artboardW]);

  const onDragOver = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(LIBRARY_DRAG_MIME) ||
      e.dataTransfer.types.includes("text/plain")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const path =
      e.dataTransfer.getData(LIBRARY_DRAG_MIME) ||
      e.dataTransfer.getData("text/plain");
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (onViewZoom)
          onViewZoom(Math.min(4, (Number(viewZoom) || 1) + 0.25) as ViewZoom);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        if (onViewZoom)
          onViewZoom(
            Math.max(0.25, (Number(viewZoom) || 1) - 0.25) as ViewZoom,
          );
      } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (onViewZoom) onViewZoom("fit");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewZoom, onViewZoom]);

  return (
    <div
      className="ms-stage__canvas"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        userSelect: "none",
        overscrollBehavior: "none",
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
            transform: `translate3d(${pan?.panX ?? 0}px, ${pan?.panY ?? 0}px, 0)`,
            transformOrigin: "0 0",
            position: "relative",
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
              onContextMenu={(e, item) => openContextMenu(e, "device", item)}
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
