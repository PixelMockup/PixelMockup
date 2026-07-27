type MobileDockProps = {
  hasDevices: boolean;
  isExporting: boolean;
  onDevices: () => void;
  onUrlFocus: () => void;
  onDownload: () => void;
};

export default function MobileDock({
  hasDevices,
  isExporting,
  onDevices,
  onUrlFocus,
  onDownload,
}: MobileDockProps) {
  return (
    <nav className="ms-mobile-dock" aria-label="Quick actions">
      <button
        type="button"
        className="ms-mobile-dock__btn"
        aria-label="Devices"
        onClick={onDevices}
      >
        Devices
      </button>
      {hasDevices ? (
        <button
          type="button"
          className="ms-mobile-dock__btn"
          aria-label="Website URL"
          onClick={onUrlFocus}
        >
          URL
        </button>
      ) : null}
      {hasDevices ? (
        <button
          type="button"
          className="ms-mobile-dock__btn ms-mobile-dock__btn--accent"
          disabled={isExporting}
          onClick={onDownload}
        >
          Download
        </button>
      ) : null}
    </nav>
  );
}
