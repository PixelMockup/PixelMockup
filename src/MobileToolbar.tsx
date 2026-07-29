import SelectionInspector from './SelectionInspector';
import ViewZoom from './ViewZoom';
import type { ViewZoom as ViewZoomType } from './artboardSnap';

type MobileToolbarProps = {
  selectionOpen: boolean;
  canEditPhoto: boolean;
  photoZoom: number;
  onPhotoZoom: (v: number) => void;
  onResetPhotoFraming: () => void;
  onUploadPhoto: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  canReorder: boolean;
  viewZoom: ViewZoomType;
  onViewZoom: (zoom: ViewZoomType) => void;
};

export default function MobileToolbar({
  selectionOpen,
  canEditPhoto,
  photoZoom,
  onPhotoZoom,
  onResetPhotoFraming,
  onUploadPhoto,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  canReorder,
  viewZoom,
  onViewZoom,
}: Readonly<MobileToolbarProps>) {
  return (
    <div className="ms-mobile-toolbar">
      <SelectionInspector
        open={selectionOpen}
        canEditPhoto={canEditPhoto}
        photoZoom={photoZoom}
        onPhotoZoom={onPhotoZoom}
        onResetPhotoFraming={onResetPhotoFraming}
        onUploadPhoto={onUploadPhoto}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onBringForward={onBringForward}
        onSendBackward={onSendBackward}
        canReorder={canReorder}
      />
      <ViewZoom viewZoom={viewZoom} onViewZoom={onViewZoom} />
    </div>
  );
}
