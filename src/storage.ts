/** Pixel Mockup localStorage keys with one-time fallback from Mockup Studio. */

const ALLOWED_KEY_PREFIXES = ['pixelMockup.', 'mockupStudio.'] as const;
const MAX_VALUE_LENGTH = 1_000_000;
const CONTROL_CHARS = /\p{Cc}/gu;

/** Duplicate allowlists here to avoid circular imports with domain modules. */
const THEME_VALUES = new Set(['light', 'dark']);
const FLAG_VALUES = new Set(['0', '1']);
const ARTBOARD_FORMAT_VALUES = new Set([
  '16-9',
  '9-16',
  '1-1',
  '4-5',
  '4-3',
  '3-2',
  '2-3',
  '21-9',
  'a4-p',
  'a4-l',
]);
const SIZE_SCALE_VALUES = new Set(['2x', '1x', '0.5x', '0.25x']);
const LIBRARY_W_MIN = 280;
const LIBRARY_W_MAX = 720;
const SNAP_MARGIN_MIN = 0;
const SNAP_MARGIN_MAX = 200;

const KEYBINDING_PLATFORMS = new Set(['mac', 'windows', 'linux']);
const KEYBINDING_ACTIONS = new Set([
  'deleteSelected',
  'deselect',
  'bringForward',
  'pushBackward',
  'bringToFront',
  'sendToBack',
  'nudgeLeft',
  'nudgeRight',
  'nudgeUp',
  'nudgeDown',
  'nudgeLeftLarge',
  'nudgeRightLarge',
  'nudgeUpLarge',
  'nudgeDownLarge',
  'duplicate',
  'undo',
  'download',
  'openShortcuts',
  'selectAll',
  'copy',
  'paste',
]);
/** Chords like "mod+shift+s", "arrowleft", "]", "?". */
const CHORD_RE = /^[a-z0-9+[\]/?-]+$/i;

function isAllowedStorageKey(key: string): boolean {
  return ALLOWED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// NOSONAR tssecurity:S8475 - sanitization step: removes control chars and caps length
function stripControlChars(value: string): string {
  return String(value).replace(CONTROL_CHARS, '').slice(0, MAX_VALUE_LENGTH);
}

function canonicalizeKey(key: string): string {
  return key.replace(/^mockupStudio\./, 'pixelMockup.');
}

function validateClampedIntString(
  value: string,
  min: number,
  max: number,
): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(min, Math.round(n)));
  return String(clamped);
}

function validateKeybindingsJson(value: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const out: Record<string, Record<string, string[]>> = {};
  for (const [platform, bindings] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!KEYBINDING_PLATFORMS.has(platform)) continue;
    if (bindings == null || typeof bindings !== 'object' || Array.isArray(bindings)) {
      continue;
    }
    const cleaned: Record<string, string[]> = {};
    for (const [action, chords] of Object.entries(
      bindings as Record<string, unknown>,
    )) {
      if (!KEYBINDING_ACTIONS.has(action)) continue;
      if (!Array.isArray(chords)) continue;
      const safeChords = chords.filter(
        (c): c is string => typeof c === 'string' && CHORD_RE.test(c),
      );
      cleaned[action] = safeChords;
    }
    out[platform] = cleaned;
  }
  return JSON.stringify(out);
}

// NOSONAR tssecurity:S8475 - central allowlist/schema validation for all storage writes
/**
 * Allowlist / schema-validate a storage value for `key`.
 * Returns the safe string to persist, or null to reject the write.
 */
export function validateStorageValue(key: string, value: string): string | null {
  if (!isAllowedStorageKey(key)) return null;
  const canonical = canonicalizeKey(key);
  const raw = stripControlChars(value);

  switch (canonical) {
    case 'pixelMockup.theme':
      // NOSONAR tssecurity:S8475 - value matched against trusted THEME_VALUES allowlist
      return THEME_VALUES.has(raw) ? raw : null;
    case 'pixelMockup.artboardFormat':
      // NOSONAR tssecurity:S8475 - value matched against trusted ARTBOARD_FORMAT_VALUES allowlist
      return ARTBOARD_FORMAT_VALUES.has(raw) ? raw : null;
    case 'pixelMockup.sizeScale':
      // NOSONAR tssecurity:S8475 - value matched against trusted SIZE_SCALE_VALUES allowlist
      return SIZE_SCALE_VALUES.has(raw) ? raw : null;
    case 'pixelMockup.libraryCollapsed':
    case 'pixelMockup.snapEnabled':
      // NOSONAR tssecurity:S8475 - value matched against trusted FLAG_VALUES allowlist
      return FLAG_VALUES.has(raw) ? raw : null;
    case 'pixelMockup.libraryWidth':
      return validateClampedIntString(raw, LIBRARY_W_MIN, LIBRARY_W_MAX);
    case 'pixelMockup.snapMargin':
      return validateClampedIntString(raw, SNAP_MARGIN_MIN, SNAP_MARGIN_MAX);
    case 'pixelMockup.keybindings.v1':
      return validateKeybindingsJson(raw);
    default:
      // Deny-by-default: unknown keys under the prefix are not persisted.
      return null;
  }
}

export function storageGet(newKey: string, legacyKey: string): string | null {
  const next = localStorage.getItem(newKey);
  if (next != null) {
    return validateStorageValue(newKey, next);
  }
  const legacy = localStorage.getItem(legacyKey);
  if (legacy != null) {
    const safe = validateStorageValue(newKey, legacy);
    if (safe == null) return null;
    try {
      // NOSONAR tssecurity:S8475 - safe is output of validateStorageValue
      localStorage.setItem(newKey, safe);
    } catch {
      /* ignore quota */
    }
    return safe;
  }
  return null;
}

export function storageSet(newKey: string, value: string): void {
  const safe = validateStorageValue(newKey, value);
  if (safe != null) {
    // NOSONAR tssecurity:S8475 - safe is output of validateStorageValue
    localStorage.setItem(newKey, safe);
  }
}
