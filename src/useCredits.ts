import { useCallback, useState, useEffect } from 'react';
import { getCounter, initCounter, decrement, isBlocked, resetCounter } from './middleware';

export interface MicrolinkUsage {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
  tier?: string;
  reason?: string;
}

export interface ScreenshotAPIUsage {
  remainingwithoutapi: number | null; // Remaining requests without API key
  limitwithoutapi: number | null; // Limit of requests without API key
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
  tier?: string;
  reason?: string;
}

export interface CreditState {
  screenshotapi: ScreenshotAPIUsage;
  microlink: MicrolinkUsage;
}

const EMPTY_USAGE: MicrolinkUsage = { remaining: null, limit: null, resetAt: null };
const EMPTY_SA_USAGE: ScreenshotAPIUsage = { remaining: null, limit: null, resetAt: null, remainingwithoutapi: null, limitwithoutapi: null };
const ML_DEFAULT_LIMIT = 25;
const SA_DEFAULT_LIMIT = 200;
const SA_DEFAULT_LIMIT_NO_KEY = 8;

export function updateUsage(
  prev: CreditState,
  provider: 'microlink' | 'screenshotapi',
  usage: Partial<MicrolinkUsage> | Partial<ScreenshotAPIUsage>
): CreditState {
  if (provider === 'microlink') {
    return { ...prev, microlink: { ...prev.microlink, ...usage as Partial<MicrolinkUsage> } };
  }
  return { ...prev, screenshotapi: { ...prev.screenshotapi, ...usage as Partial<ScreenshotAPIUsage> } };
}

export function resetUsage(
  prev: CreditState,
  provider: 'microlink' | 'screenshotapi'
): CreditState {
  if (provider === 'microlink') {
    return { ...prev, microlink: { remaining: null, limit: ML_DEFAULT_LIMIT, resetAt: null } };
  }
  return { ...prev, screenshotapi: { remaining: null, limit: SA_DEFAULT_LIMIT, resetAt: null, remainingwithoutapi: null, limitwithoutapi: SA_DEFAULT_LIMIT_NO_KEY } };
}

export function useCredits() {
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: { ...EMPTY_SA_USAGE },
    microlink: { ...EMPTY_USAGE, limit: ML_DEFAULT_LIMIT },
  });
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const fetchCredits = useCallback(async () => {
    setIsLoadingCredits(true);

    try {
      // Middle-layer guard: halt at 0 per package.docx
      if (isBlocked()) { console.warn("Counter blocked at 0 — halting API request"); return; }

      // Cache busting ensure to never get stale vercel edge cache data
      const res = await fetch(`/api/credits?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });

      if (res.ok) {
        const data = await res.json();

        // update Microlink state
        if (data.remaining != null || data.limit != null || data.resetAt != null) {
          setCredits((prev) => updateUsage(prev, 'microlink', {
            remaining: data.remaining ?? prev.microlink.remaining,
            limit: data.limit ?? prev.microlink.limit,
            resetAt: data.resetAt ?? prev.microlink.resetAt,
            tier: data.tier ?? prev.microlink.tier,
          }));
        }
        // update ScreenshotAPI state
        // Only treat microlink fields as SA when the response is explicitly SA
        const saRemaining = (data.provider === 'screenshotapi' || data.saRemaining != null) ? (data.saRemaining ?? data.remaining) : null;
        const saLimit = (data.provider === 'screenshotapi' || data.saLimit != null) ? (data.saLimit ?? data.limit) : null;
        const saResetAt = (data.provider === 'screenshotapi' || data.saResetAt != null) ? (data.saResetAt ?? data.resetAt) : null;
        const saNoApiRemaining = data.remainingwithoutapi;
        const saNoApiLimit = data.limitwithoutapi;

        // Clear stale key-based values when only public/no-key data arrives
        const clearKeyFields = (saNoApiRemaining != null || saNoApiLimit != null) && (saRemaining == null && saLimit == null);
        if (saRemaining != null || saLimit != null || saResetAt != null || saNoApiRemaining != null || saNoApiLimit != null) {
          setCredits((prev) => updateUsage(prev, 'screenshotapi', {
            remaining: saRemaining ?? (clearKeyFields ? null : prev.screenshotapi.remaining),
            limit: saLimit ?? (clearKeyFields ? null : prev.screenshotapi.limit),
            resetAt: saResetAt ?? prev.screenshotapi.resetAt,
            remainingwithoutapi: saNoApiRemaining ?? prev.screenshotapi.remainingwithoutapi,
            limitwithoutapi: saNoApiLimit ?? prev.screenshotapi.limitwithoutapi,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setIsLoadingCredits(false);
    }
  }, []);

  // Initialize ScreenshotAPI no-key rate limits via POST (one-time calibration with curl-style header probe)
  useEffect(() => {
    const initScreenshotApi = async () => {
      try {
        const res = await fetch(`/api/credits?provider=screenshotapi`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.remainingwithoutapi != null || d.limitwithoutapi != null) {
            setCredits((prev) => updateUsage(prev, 'screenshotapi', {
              remainingwithoutapi: d.remainingwithoutapi ?? prev.screenshotapi.remainingwithoutapi,
              limitwithoutapi: d.limitwithoutapi ?? prev.screenshotapi.limitwithoutapi,
            }));
          }
        }
      } catch (e) { console.error('ScreenshotAPI init POST failed:', e); }
    };
    // Retry until we have no-key data; only for screenshotapi without validated key
    const hasNoKeyData = credits.screenshotapi.limitwithoutapi != null || credits.screenshotapi.remainingwithoutapi != null;
    if (!hasNoKeyData) { initScreenshotApi(); }
  }, [credits.screenshotapi.limitwithoutapi, credits.screenshotapi.remainingwithoutapi]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    // 60-second countdown for ScreenshotAPI free tier (8 req/min)
    if (countdown > 0) {
      const t = setInterval(() => setCountdown((c) => c - 1), 1000);
      return () => clearInterval(t);
    }
  }, [countdown]);

  const updateUsageCallback = useCallback((provider: 'microlink' | 'screenshotapi', usage: Partial<MicrolinkUsage> | Partial<ScreenshotAPIUsage>) => {
    setCredits((prev) => updateUsage(prev, provider, usage));
  }, []);

  const updateCredits = useCallback(
    (
      provider: string,
      remaining: number | null,
      extras?: { limit?: number | null; resetAt?: number | null },
    ) => {
      setCredits((prev) => updateUsage(prev, provider as 'microlink' | 'screenshotapi', {
        remaining,
        limit: extras?.limit ?? undefined,
        resetAt: extras?.resetAt ?? undefined,
      }));
    },
    [updateUsage, resetUsage],
  );

  const resetUsageCallback = useCallback((provider: 'microlink' | 'screenshotapi') => {
    setCredits((prev) => resetUsage(prev, provider));
  }, []);

  return {
    credits,
    updateCredits,
    updateUsage: updateUsageCallback,
    resetUsage: resetUsageCallback,
    refreshCredits: fetchCredits,
    isLoadingCredits,
  };
}
