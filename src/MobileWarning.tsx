import { useEffect, useState } from 'react';


function isPhoneTooSmall(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Block any device that is not clearly a laptop/desktop (small or portrait tablet included)
  return w < 1024 || (w <= 1024 && h < 768);
}

export default function MobileWarning() {
  const [tooSmall, setTooSmall] = useState(isPhoneTooSmall());

  useEffect(() => {
    const onResize = () => setTooSmall(isPhoneTooSmall());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!tooSmall) return null;

  return (
    <div
      className="ms-mobile-warning"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ms-mobile-warning-title"
    >
      <div
        className="ms-mobile-warning__card"
        style={{
          background: 'var(--ms-surface-raised)',
          border: '1px solid var(--ms-border-strong)',
          borderRadius: 'var(--ms-radius)',
          padding: '32px 28px',
          maxWidth: '28rem',
          textAlign: 'center',
          boxShadow: 'var(--ms-shadow)',
          backdropFilter: 'blur(20px) saturate(180%)',
        }}
      >
        <h2 id="ms-mobile-warning-title" className="ms-mobile-warning__title" style={{ fontFamily: 'var(--ms-display)', fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '12px' }}>
          Laptop only
        </h2>
        <p className="ms-mobile-warning__body" style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--ms-muted)', marginBottom: '24px' }}>
          This tool requires a laptop or desktop computer. It is not designed for phones or tablets, and functionality is not guaranteed on mobile devices.
        </p>
        <div className="ms-mobile-warning__actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <a
            href="/"
            className="ms-btn ms-btn--primary"
            style={{ fontWeight: 600, padding: '10px 20px' }}
          >
            Use on laptop
          </a>
        </div>
      </div>
    </div>
  );
}
