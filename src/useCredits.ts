import { useCallback, useState } from 'react';

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

const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };

export function useCredits() {
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    microlink: { ...EMPTY_USAGE },
  });

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
