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
  screenshotapiResetAt?: number | null;
  microlink: MicrolinkUsage;
}


const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };
const SA_FREE_TIER_LIMIT = 200;

  // async function fetchMicrolinkCredits(): Promise<Partial<MicrolinkUsage>> {
  //   try {
  //     const res = await fetch(`/api/credits?t=${Date.now()}`, {
  //       cache: 'no-store',
  //       headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  //     });
  //     if (!res.ok) return {};
  //     const data = await.json();
  //     return {
  //       remaining: data.remaining ?? null,
  //       limit: data.limit ?? null,
  //       resetAt: data.resetAt ?? null,
  //     };
  // } catch {
  //     return {};
  //   }
  // }

export function useCredits() {
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    screenshotapiLimit: SA_FREE_TIER_LIMIT,
    screenshotapiResetAt: null,
    microlink: EMPTY_USAGE,
  });
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);

  const fetchCredits = useCallback(async () => {
    setIsLoadingCredits(true);

    try {
      // Cache busting ensure to never get stale vercel edge cache data
      const res = await fetch(`/api/credits?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });

      if (res.ok) {
        const data = await res.json();

        // update Microlink state
        if (data.remaining != null || data.limit != null || data.resetAt != null) {
          setCredits((prev) => ({
            ...prev,
            microlink: {
              remaining: data.remaining ?? prev.microlink.remaining,
              limit: data.limit ?? prev.microlink.limit,
              resetAt: data.resetAt ?? prev.microlink.resetAt,
              tier: data.tier ?? prev.microlink.tier,
            },
          }));
        }
        // update ScreenshotAPI state
        // handle both generic keys and specific keys
        const saRemaining = data.saRemaining ?? data.remaining;
        const saLimit = data.saLimit ?? data.limit;
        const saResetAt = data.saResetAt ?? data.resetAt;

        if (saRemaining != null || saLimit != null || saResetAt != null) {
          setCredits((prev) => ({
            ...prev,
            screenshotapi: saRemaining ?? prev.screenshotapi,
            screenshotapiLimit: saLimit ?? prev.screenshotapiLimit,
            screenshotapiResetAt: saResetAt ?? prev.screenshotapiResetAt,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setIsLoadingCredits(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const updateScreenshotApiCredits = useCallback((remaining: number | null, limit?: number | null, resetAt?: number | null) => {
    setCredits((prev) => ({
      ...prev,
      screenshotapi: remaining,
      screenshotapiLimit: limit ?? prev.screenshotapiLimit,
      screenshotapiResetAt: resetAt ?? prev.screenshotapiResetAt,
    }));
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
        updateScreenshotApiCredits(remaining, extras?.limit ?? null, extras?.resetAt ?? null);
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
