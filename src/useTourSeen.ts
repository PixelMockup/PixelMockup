import { useEffect, useState } from 'react';
import { storageGet, storageSet } from './storage';

const TOUR_SEEN_KEY = 'pixelMockup.tourSeen';
const TOUR_SEEN_LEGACY_KEY = 'mockupStudio.tourSeen';

export function useTourSeen() {
  const [seen, setSeen] = useState<boolean>(() => readTourSeen());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSeen(readTourSeen());
    setReady(true);
  }, []);

  const markSeen = () => {
    try {
      storageSet(TOUR_SEEN_KEY, '1');
      setSeen(true);
    } catch {
      // localStorage unavailable; treat as seen for this session only.
      setSeen(true);
    }
  };

  const reset = () => {
    try {
      storageSet(TOUR_SEEN_KEY, '0');
      setSeen(false);
    } catch {
      setSeen(false);
    }
  };

  return { seen, ready, markSeen, reset };
}

function readTourSeen(): boolean {
  try {
    return storageGet(TOUR_SEEN_KEY, TOUR_SEEN_LEGACY_KEY) === '1';
  } catch {
    return false;
  }
}
