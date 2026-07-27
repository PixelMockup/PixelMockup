import { useEffect, useState } from 'react';
import { storageGet, storageSet } from './storage';

export type ThemeId = 'light' | 'dark';

const STORAGE_KEY = 'pixelMockup.theme';
const LEGACY_KEY = 'mockupStudio.theme';

function readStoredTheme(): ThemeId {
  try {
    const raw = storageGet(STORAGE_KEY, LEGACY_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // ignore
  }
  return 'light';
}

function applyTheme(theme: ThemeId) {
  const safe = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = safe;
}

/** Apply stored theme before first paint helpers (call once at boot). */
export function initTheme(): ThemeId {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => initTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'light' || theme === 'dark') {
        storageSet(STORAGE_KEY, theme);
      }
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return { theme, setTheme, toggleTheme };
}
