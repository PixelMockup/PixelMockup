import { useEffect, useState } from 'react';

const PHONE_WIDTH_THRESHOLD = 480;
const PHONE_HEIGHT_THRESHOLD = 600;

function isPhonePortrait(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w <= PHONE_WIDTH_THRESHOLD && h > w;
}

function isPhoneTooSmall(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w <= PHONE_WIDTH_THRESHOLD && h <= PHONE_HEIGHT_THRESHOLD && h <= w;
}

export default function MobileWarning() {
  const [dismissed, setDismissed] = useState(false);
  const [portrait, setPortrait] = useState(isPhonePortrait);
  const [tooSmall, setTooSmall] = useState(isPhoneTooSmall);

  useEffect(() => {
    const onResize = () => {
      setPortrait(isPhonePortrait());
      setTooSmall(isPhoneTooSmall());
    };
    window.addEventListener('resize', onResize);
    if (screen.orientation) {
      screen.orientation.addEventListener?.('change', onResize);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (screen.orientation) {
        screen.orientation.removeEventListener?.('change', onResize);
      }
    };
  }, []);

  const tryLandscape = async () => {
    try {
      await screen.orientation?.lock?.('landscape');
    } catch {
      // Some browsers/devices refuse or do not support orientation lock.
    }
  };

  if (dismissed || (!portrait && !tooSmall)) return null;

  return (
    <div
      className="ms-mobile-warning"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ms-mobile-warning-title"
    >
      <div className="ms-mobile-warning__card">
        <h2 id="ms-mobile-warning-title" className="ms-mobile-warning__title">
          {portrait ? 'Rotate for the best experience' : 'Screen is very small'}
        </h2>
        <p className="ms-mobile-warning__body">
          {portrait
            ? 'Pixel Mockup works best on tablets, laptops, or phones held sideways. Rotate your device to landscape to use the full studio.'
            : 'Pixel Mockup is designed for larger screens. You can try, but the workspace will be cramped.'}
        </p>
        <div className="ms-mobile-warning__actions">
          {portrait ? (
            <button
              type="button"
              className="ms-btn ms-btn--primary"
              onClick={tryLandscape}
            >
              Rotate to landscape
            </button>
          ) : null}
          <button
            type="button"
            className="ms-btn ms-btn--ghost"
            onClick={() => setDismissed(true)}
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
