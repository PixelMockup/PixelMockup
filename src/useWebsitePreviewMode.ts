import { useEffect, useState } from 'react';
import { storageGet, storageSet } from './storage';

export type WebsitePreviewMode = 'screenshot' | 'iframe';

const STORAGE_KEY = 'pixelMockup.websitePreviewMode';

function readStoredMode(): WebsitePreviewMode {
  const raw = storageGet(STORAGE_KEY, STORAGE_KEY);
  return raw === 'iframe' ? 'iframe' : 'screenshot';
}

/**
 * How website URLs are shown on device screens: Playwright screenshot
 * (needs capture server) or live iframe (works on static hosts; some sites block embedding).
 */
export function useWebsitePreviewMode() {
  const [mode, setModeState] = useState<WebsitePreviewMode>(() => readStoredMode());

  useEffect(() => {
    storageSet(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = (next: WebsitePreviewMode) => {
    setModeState(next === 'iframe' ? 'iframe' : 'screenshot');
  };

  const toggleMode = () => {
    setModeState((m) => (m === 'iframe' ? 'screenshot' : 'iframe'));
  };

  return { websitePreviewMode: mode, setWebsitePreviewMode: setMode, toggleWebsitePreviewMode: toggleMode };
}
