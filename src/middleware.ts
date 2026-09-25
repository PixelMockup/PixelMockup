// Middleware state map: provider + hasKey -> counter state
// Updated by /api/credits POST/GET; read by useCredits (Approach B)

type State = {
  limit: number;
  remaining: number;
  resetAt: number | null;
  firstRequestTime: number | null;
  initialized: boolean;
};

const stateMap = new Map<string, State>();

function key(provider: string, hasKey?: boolean): string {
  return `${provider}:${hasKey ? 'withKey' : 'withoutKey'}`;
}

export function getCounter(provider?: string, hasKey?: boolean): State {
  const k = provider ? key(provider, hasKey) : 'default';
  if (!stateMap.has(k)) {
    stateMap.set(k, { limit: 25, remaining: 25, resetAt: null, firstRequestTime: null, initialized: false });
  }
  const s = stateMap.get(k)!;
  // Auto-reset when reset window passed and balance exhausted
  if (s.resetAt != null && s.remaining <= 0 && Date.now() >= s.resetAt * 1000) {
    s.remaining = s.limit;
    s.resetAt = null;
    s.initialized = false;
  }
  return s;
}

export function initCounter(provider: string, hasKey: boolean, data: { limit?: number; remaining?: number; resetAt?: number }) {
  const k = key(provider, hasKey);
  if (!stateMap.has(k) || !stateMap.get(k)!.initialized) {
    stateMap.set(k, {
      limit: data.limit ?? 25,
      remaining: data.remaining ?? 25,
      resetAt: data.resetAt ?? null,
      firstRequestTime: Date.now(),
      initialized: true,
    });
  }
}

export function decrement(provider?: string, hasKey?: boolean) {
  const s = getCounter(provider, hasKey);
  if (s.remaining > 0) s.remaining--;
  return s.remaining;
}

export function getRefreshSeconds(provider?: string, hasKey?: boolean): number {
  const s = getCounter(provider, hasKey);
  if (!s.firstRequestTime) return 60;
  if (provider === 'microlink' && s.resetAt) {
    const resetDiff = Math.floor((s.resetAt * 1000 - Date.now()) / 1000);
    return Math.max(0, resetDiff);
  }
  const elapsed = Math.floor((Date.now() - s.firstRequestTime) / 1000);
  return Math.max(0, 60 - elapsed);
}

export function isBlocked(provider?: string, hasKey?: boolean) {
  return getCounter(provider, hasKey).remaining <= 0;
}

export function resetCounter(provider?: string, hasKey?: boolean) {
  const s = getCounter(provider, hasKey);
  s.remaining = s.limit;
  s.initialized = false;
  s.firstRequestTime = null;
}

