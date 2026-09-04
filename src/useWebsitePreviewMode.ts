import { useEffect, useState } from 'react';
import { storageGet, storageSet } from './storage';

export type WebsitePreviewMode = 'screenshot';

const STORAGE_KEY = 'pixelMockup.websitePreviewMode';

function readStoredMode(): WebsitePreviewMode {
  const raw = storageGet(STORAGE_KEY, STORAGE_KEY);
  return raw === 'screenshot' ? 'screenshot' : 'screenshot';
}

export function useWebsitePreviewMode() {
  const [mode, setModeState] = useState<WebsitePreviewMode>(() => readStoredMode());

  useEffect(() => {
    storageSet(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = (_next: WebsitePreviewMode) => {
    setModeState('screenshot');
  };

  return { websitePreviewMode: mode, setWebsitePreviewMode: setMode };
}
