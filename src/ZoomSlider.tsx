import { useState } from 'react';
import type { ViewZoom } from './artboardSnap';

type Props = {
  viewZoom: ViewZoom;
  onViewZoom: (v: ViewZoom) => void;
};

export default function ZoomSlider({ viewZoom, onViewZoom }: Readonly<Props>) {
  const pct = Math.min(
    175,
    Math.max(50, Math.round((Number(viewZoom) || 1) * 100)),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const presets: { label: string; value: ViewZoom | number }[] = [
    { label: '175%', value: 1.75 },
    { label: '150%', value: 1.5 },
    { label: '125%', value: 1.25 },
    { label: '100%', value: 1 },
    { label: '50%', value: 0.5 },
    { label: 'Fit', value: 'fit' as ViewZoom },
    { label: 'Fill', value: 'fill' as ViewZoom },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 15,
        padding: '30px 8px',
      }}
      aria-label="Zoom slider"
    >
      <input
        type="range"
        min={50}
        max={175}
        step={25}
        value={pct}
        onChange={(e) => {
          const val = Number.parseInt(e.target.value, 10) / 100;
          if (val <= 0 || Number.isNaN(val)) onViewZoom('fit' as ViewZoom);
          else onViewZoom(val as ViewZoom);
        }}
        aria-label="Zoom percentage"
        style={{
          writingMode: 'vertical-lr',
          direction: 'ltr',
          appearance: 'slider-vertical',
          WebkitAppearance: 'slider-vertical',
          transform: 'rotate(-180deg)',
          width: 8,
          height: 100,
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          accentColor: 'var(--ms-accent-color, #007bff)',
        }}
      />
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Zoom presets"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          style={{
            fontSize: '0.85rem',
            minWidth: 36,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
            background: 'transparent',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 6,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          {viewZoom === 'fit' ? 'Fit' : viewZoom === 'fill' ? 'Fill' : `${pct}%`}
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Zoom presets"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 4px)',
              left: '150%',
              transform: 'translateX(-30%)',
              background: '#1a1a2e',
              color: '#fff',
              borderRadius: 8,
              padding: '4px 0',
              minWidth: 90,
              fontSize: '0.8rem',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  onViewZoom(p.value as ViewZoom);
                  setMenuOpen(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
