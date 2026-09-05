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

// Read the last known state from STORAGE_KEY
function getStoredUsage(): MicrolinkUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);

      // Optimistic Reset: If the reset time has passed, assume it's back to the limit
      // This prevents showing "0/25" for hours after the UTC rollover.
      if (parsed.resetAt && Date.now() / 1000 > parsed.resetAt) {
        return {
          remaining: parsed.limit ?? 25,
          limit: parsed.limit ?? 25,
          resetAt: null
        };
      }
      return parsed;
    }
  } catch {
    // Ignore parse errors (e.g., corrupted storage)
  }
  return { remaining: null, limit: null, resetAt: null };
}

// ✅ NEW: Save state to localStorage whenever it updates
function setStoredUsage(usage: MicrolinkUsage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Ignore (e.g., private browsing mode)
  }
}

const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };

export function useCredits() {
  // Initialize from localstorage insted of empty state
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    microlink: getStoredUsage(),
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
