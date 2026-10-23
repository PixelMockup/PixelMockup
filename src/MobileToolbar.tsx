import SelectionInspector from './SelectionInspector';

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
}: Readonly<MobileToolbarProps>) {
  if (!selectionOpen) return null;

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
    </div>
  );
}
