/** Pixel Mockup localStorage keys with one-time fallback from Mockup Studio. */

export function storageGet(newKey: string, legacyKey: string): string | null {
  const next = localStorage.getItem(newKey);
  if (next != null) return next;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy != null) {
    try {
      localStorage.setItem(newKey, legacy);
    } catch {
      /* ignore quota */
    }
    return legacy;
  }
  return null;
}

export function storageSet(newKey: string, value: string): void {
  localStorage.setItem(newKey, value);
}
