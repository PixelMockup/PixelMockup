import { useEffect, useId, useRef } from 'react';

export type DialogAction = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
};

type AppDialogProps = {
  open: boolean;
  title: string;
  /** What happened */
  body: string;
  /** Why this happens */
  reason?: string;
  /** What you can do (remediation) */
  detail?: string;
  /** Optional opaque server string for power users */
  technicalDetail?: string;
  onClose: () => void;
  actions: DialogAction[];
  /** Accessible name when title is decorative. */
  ariaLabel?: string;
};

/**
 * In-app modal using the shared `.ms-modal*` styles (no window.alert/confirm).
 */
export default function AppDialog({
  open,
  title,
  body,
  reason,
  detail,
  technicalDetail,
  onClose,
  actions,
  ariaLabel,
}: Readonly<AppDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="ms-modal-backdrop"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      aria-label={ariaLabel}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="ms-modal ms-modal--compact">
        <div className="ms-modal-header">
          <div style={{ flex: 1 }}>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="ms-modal-body ms-modal-body--dialog" id={bodyId}>
          {reason ? (
            <>
              <p className="ms-dialog-label">What happened</p>
              <p className="ms-dialog-body">{body}</p>
              <p className="ms-dialog-label">Why this happens</p>
              <p className="ms-dialog-reason">{reason}</p>
              {detail ? (
                <>
                  <p className="ms-dialog-label">What you can do</p>
                  <p className="ms-dialog-detail">{detail}</p>
                </>
              ) : null}
              {technicalDetail ? (
                <p className="ms-dialog-tech">
                  Technical detail: {technicalDetail}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="ms-dialog-body">{body}</p>
              {detail ? <p className="ms-dialog-detail">{detail}</p> : null}
            </>
          )}
        </div>
        <div className="ms-modal-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={[
                'ms-btn',
                action.variant === 'primary' ? 'ms-btn--primary' : '',
                action.variant === 'ghost' || !action.variant
                  ? 'ms-btn--ghost'
                  : '',
                action.variant === 'danger' ? 'ms-btn--danger' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
