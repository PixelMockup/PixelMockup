/** Pixel Mockup localStorage keys with one-time fallback from Mockup Studio. */

const ALLOWED_KEY_PREFIXES = ['pixelMockup.', 'mockupStudio.'] as const;
const MAX_VALUE_LENGTH = 1_000_000;
const CONTROL_CHARS = /\p{Cc}/gu;

function isAllowedStorageKey(key: string): boolean {
  return ALLOWED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function sanitizeStorageValue(value: string): string {
  return String(value)
    .replace(CONTROL_CHARS, '')
    .slice(0, MAX_VALUE_LENGTH);
}

export function storageGet(newKey: string, legacyKey: string): string | null {
  const next = localStorage.getItem(newKey);
  if (next != null) return next;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy != null) {
    try {
      if (isAllowedStorageKey(newKey)) {
        localStorage.setItem(newKey, sanitizeStorageValue(legacy));
      }
    } catch {
      /* ignore quota */
    }
    return legacy;
  }
  return null;
}

export function storageSet(newKey: string, value: string): void {
  if (isAllowedStorageKey(newKey)) {
    localStorage.setItem(newKey, sanitizeStorageValue(value));
  }
}
