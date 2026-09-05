import { useCallback, useState, useEffect } from 'react';

export interface MicrolinkUsage {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
  tier?: string;
  reason?: string;
}

export interface CreditState {
  screenshotapi: number | null;
  microlink: MicrolinkUsage;
}

const STORAGE_KEY = 'pixelMockup_microlink_usage';

// Save state to localStorage whenever it updates
function setStoredUsage(usage: MicrolinkUsage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Ignore (e.g., private browsing mode)
  }
}

const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };

export function useCredits() {
  // Always start fresh — show values only after a capture returns them.
  // Stale localStorage cache causes the UI to show wrong credits (e.g. 23/25
  // when the actual remaining is 8/25 after several captures).
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    microlink: EMPTY_USAGE,
  });

  // Automatically persist to localStorage whenever microlink usage changes
  useEffect(() => {
    setStoredUsage(credits.microlink);
  }, [credits.microlink]);

  const updateScreenshotApiCredits = useCallback((remaining: number | null) => {
    setCredits((prev) => ({ ...prev, screenshotapi: remaining }));
  }, []);

  const updateMicrolinkUsage = useCallback((usage: Partial<MicrolinkUsage>) => {
    setCredits((prev) => ({
      ...prev,
      microlink: { ...prev.microlink, ...usage },
    }));
  }, []);

  const updateCredits = useCallback(
    (
      provider: string,
      remaining: number | null,
      extras?: { limit?: number | null; resetAt?: number | null },
    ) => {
      if (provider === 'screenshotapi') {
        updateScreenshotApiCredits(remaining);
      } else if (provider === 'microlink') {
        updateMicrolinkUsage({
          remaining,
          limit: extras?.limit ?? undefined,
          resetAt: extras?.resetAt ?? undefined,
        });
      }
    },
    [updateScreenshotApiCredits, updateMicrolinkUsage],
  );

  const resetMicrolinkUsage = useCallback(() => {
    setCredits((prev) => ({ ...prev, microlink: { ...EMPTY_USAGE } }));
  }, []);

  return {
    credits,
    updateCredits,
    updateScreenshotApiCredits,
    updateMicrolinkUsage,
    resetMicrolinkUsage,
  };
}
