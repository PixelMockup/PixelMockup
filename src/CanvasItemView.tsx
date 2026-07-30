import type { CSSProperties } from 'react';
import type { CanvasItem } from './MockupStudio';
import { useLongPress } from './useLongPress';
import { getWebsiteViewport } from './websiteUrl';
import WebsiteScreen from './WebsiteScreen';
import { formatDeviceDisplayName } from './deviceMeta';
import { screenObjectPosition } from './deviceScreenBounds';
import {
  resolveItemScreen,
  screenClipInsetCss,
  type DeviceScreenRect,
} from './deviceScreens';
import type { ContentBounds } from './imageContentBounds';

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

function screenLayerStyle(
  screen: ContentBounds,
  content: ContentBounds,
): CSSProperties {
  const w = Math.max(1, content.width);
  const h = Math.max(1, content.height);
  return {
    left: `${((screen.x - content.x) / w) * 100}%`,
    top: `${((screen.y - content.y) / h) * 100}%`,
    width: `${(screen.width / w) * 100}%`,
    height: `${(screen.height / h) * 100}%`,
  };
}

type CanvasItemViewProps = Readonly<{
  item: CanvasItem;
  isSelected: boolean;
  isHovered: boolean;
  isGrabbing: boolean;
  artboardW: number;
  artboardH: number;
  websiteUrl: string | null;
  screenDrag?: { id: string } | null;
  onPointerDown: (e: React.PointerEvent, item: CanvasItem) => void;
  onContextMenu: (e: React.MouseEvent | React.PointerEvent, item: CanvasItem) => void;
  onScreenPointerDown: (e: React.PointerEvent, item: CanvasItem) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
}>;

function CanvasItemView({
  item,
  isSelected,
  isHovered,
  isGrabbing,
  artboardW,
  artboardH,
  websiteUrl,
  screenDrag,
  onPointerDown,
  onContextMenu,
  onScreenPointerDown,
  onHoverStart,
  onHoverEnd,
}: CanvasItemViewProps) {
  const displayName = formatDeviceDisplayName(item.name);
  const showCaption = isSelected || isHovered;
  const zIndex = isSelected ? item.zIndex + 1000 : item.zIndex + 100;

  const longPress = useLongPress(
    (e) => {
      onContextMenu(e, item);
    },
    { delay: 500 },
  );

  const screen = resolveItemScreen(item);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        role="img"
        aria-label={displayName}
        title={displayName}
        onPointerDown={(e) => {
          longPress.onPointerDown(e);
          onPointerDown(e, item);
        }}
        onPointerUp={longPress.onPointerUp}
        onPointerMove={longPress.onPointerMove}
        onContextMenu={(e) => {
          longPress.onContextMenu(e);
          onContextMenu(e, item);
        }}
        onPointerEnter={() => onHoverStart(item.instanceId)}
        onPointerLeave={(e) => {
          longPress.onPointerLeave(e);
          onHoverEnd(item.instanceId);
        }}
        className={[
          'ms-canvas-item',
          isSelected ? 'ms-canvas-item--selected' : '',
          isGrabbing ? 'ms-canvas-item--grabbing' : 'ms-canvas-item--grab',
          showCaption ? 'ms-canvas-item--caption' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          left: `${(item.x / artboardW) * 100}%`,
          top: `${(item.y / artboardH) * 100}%`,
          width: `${(item.displayWidth / artboardW) * 100}%`,
          height: `${(item.displayHeight / artboardH) * 100}%`,
          zIndex,
        }}
      >
        <div className="ms-canvas-item__frame">
          <CanvasItemScreen
            item={item}
            screen={screen}
            isSelected={isSelected}
            websiteUrl={websiteUrl}
            screenDrag={screenDrag}
            onScreenPointerDown={onScreenPointerDown}
          />
          <img
            src={item.screenImageSrc && item.punchedSrc ? item.punchedSrc : item.src}
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
        {showCaption && (
          <span className="ms-canvas-item__caption" aria-hidden="true">
            {displayName}
          </span>
        )}
      </div>
    </>
  );
}

function CanvasItemScreen({
  item,
  screen,
  isSelected,
  websiteUrl,
  screenDrag,
  onScreenPointerDown,
}: Readonly<{
  item: CanvasItem;
  screen: DeviceScreenRect | null;
  isSelected: boolean;
  websiteUrl: string | null;
  screenDrag?: { id: string } | null;
  onScreenPointerDown: (e: React.PointerEvent, item: CanvasItem) => void;
}>) {
  if (!screen) return null;
  if (item.screenImageSrc) {
    return (
      <>
        <div
          className="ms-canvas-item__screen"
          style={screenClipInsetCss(screen, item.contentBounds)}
        >
          <img
            src={item.screenImageSrc}
            alt=""
            draggable={false}
            className="ms-canvas-item__screen-img"
            style={{
              objectPosition: (() => {
                const p = screenObjectPosition(item.screenPanX, item.screenPanY);
                return `${p.x}% ${p.y}%`;
              })(),
              transform: `scale(${item.screenZoom})`,
            }}
          />
        </div>
        {isSelected ? (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div
            className={[
              'ms-canvas-item__screen-hit',
              screenDrag?.id === item.instanceId
                ? 'ms-canvas-item__screen-hit--panning'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={screenLayerStyle(screen, item.contentBounds)}
            onPointerDown={(e) => onScreenPointerDown(e, item)}
          />
        ) : null}
      </>
    );
  }
  if (websiteUrl) {
    const viewport = getWebsiteViewport(item.category, item.catalogFile);
    const rxPct = screen.width > 0 ? (screen.rx / screen.width) * 100 : 0;
    return (
      <div
        className="ms-canvas-item__screen ms-canvas-item__screen--website"
        style={{
          ...screenLayerStyle(screen, item.contentBounds),
          borderRadius: screen.rx > 0 ? `${rxPct}%` : undefined,
        }}
      >
        <WebsiteScreen
          url={websiteUrl}
          viewport={viewport}
          title={`Website on ${formatDeviceDisplayName(item.name)}`}
        />
      </div>
    );
  }
  return null;
}

export default CanvasItemView;
