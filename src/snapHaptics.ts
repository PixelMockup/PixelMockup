/**
 * Progressive-enhancement snap haptic.
 * Chromium/Android: navigator.vibrate. Safari 17.4+: checkbox switch trick.
 * Firefox / unsupported: silent no-op — snap still works fully.
 */

let switchEl: HTMLInputElement | null = null;

function ensureSafariSwitch(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null;
  if (switchEl && document.body.contains(switchEl)) return switchEl;
  try {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    switchEl = input;
    return input;
  } catch {
    return null;
  }
}

function pulseSafariSwitch() {
  const el = ensureSafariSwitch();
  if (!el) return;
  try {
    el.checked = !el.checked;
  } catch {
    // ignore
  }
}

/** Fire once when a snap guide newly latches. Never throws. */
export function pulseSnapHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const ok = navigator.vibrate(8);
      if (ok) return;
    }
  } catch {
    // fall through
  }
  pulseSafariSwitch();
}

/** Stable key for current guides — used to detect latch transitions. */
export function snapGuidesLatchKey(guides: {
  vertical: { pos: number; kind: string }[];
  horizontal: { pos: number; kind: string }[];
}): string {
  if (guides.vertical.length === 0 && guides.horizontal.length === 0) {
    return '';
  }
  const v = guides.vertical.map((g) => `${g.kind}:${g.pos}`).join(',');
  const h = guides.horizontal.map((g) => `${g.kind}:${g.pos}`).join(',');
  return `${v}|${h}`;
}
