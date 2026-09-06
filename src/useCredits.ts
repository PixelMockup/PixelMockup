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
  screenshotapiLimit: number | null;
  microlink: MicrolinkUsage;
}


const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };
const SA_FREE_TIER_LIMIT = 200;

async function fetchMicrolinkCredits(): Promise<Partial<MicrolinkUsage>> {
  try {
    const res = await fetch('/api/credits');
    if (!res.ok) return {};
    const data = await res.json() as { remaining?: number; limit?: number; resetAt?: number };
    return {
      remaining: data.remaining ?? null,
      limit: data.limit ?? null,
      resetAt: data.resetAt ?? null,
    };
  } catch {
    return {};
  }
}

export function useCredits() {
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    screenshotapiLimit: SA_FREE_TIER_LIMIT,
    microlink: EMPTY_USAGE,
  });
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);

  const fetchCredits = useCallback(async () => {
    setIsLoadingCredits(true);
    const mlData = await fetchMicrolinkCredits();
    if (mlData.remaining != null || mlData.limit != null || mlData.resetAt != null) {
      setCredits((prev) => ({
        ...prev,
        microlink: { ...prev.microlink, ...mlData },
      }));
    }
    setIsLoadingCredits(false);
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const updateScreenshotApiCredits = useCallback((remaining: number | null) => {
    setCredits((prev) => ({ ...prev, screenshotapi: remaining, screenshotapiLimit: SA_FREE_TIER_LIMIT }));
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
    refreshCredits: fetchCredits,
    isLoadingCredits,
  };
}
