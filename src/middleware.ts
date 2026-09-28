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
    let defaultLimit = 0;
    if (provider === 'screenshotapi') {
      defaultLimit = (hasKey ? 200 : 8)
    } else if (provider === 'microlink') {
      defaultLimit = 25
    } else defaultLimit = 0;
    // const defaultLimit = provider === 'screenshotapi' ? (hasKey ? 200 : 8) : 25;
    stateMap.set(
      k,
      {
        limit: defaultLimit,
        remaining: defaultLimit,
        resetAt: null,
        firstRequestTime: null,
        initialized: false
      });
  }
  const s = stateMap.get(k)!;
  // Auto-reset when reset window passed (always refresh at reset time, not just at 0)
  if (s.resetAt != null && Date.now() >= s.resetAt * 1000) {
    s.remaining = s.limit;
    s.resetAt = null;
    s.initialized = false;
    s.firstRequestTime = null;
  }
  return s;
}

export function updateCounter(
  provider: string,
  hasKey: boolean,
  data: {
    limit?: number;
    remaining?: number;
    resetAt?: number
  }) {
  const k = key(provider, hasKey);
  if (stateMap.has(k)) {
    const s = stateMap.get(k)!;
    if (data.limit != null) s.limit = data.limit;
    if (data.remaining != null) s.remaining = data.remaining;
    if (data.resetAt !== undefined) s.resetAt = data.resetAt;
    s.initialized = true;
    s.firstRequestTime = Date.now();
  }
}

export function initCounter(provider: string, hasKey: boolean, data: { limit?: number; remaining?: number; resetAt?: number }) {
  const k = key(provider, hasKey);
  const correctLimit = provider === 'screenshotapi' ? (hasKey ? 200 : 8) : 25;
  if (!stateMap.has(k) || !stateMap.get(k)!.initialized) {
    stateMap.set(k, {
      limit: data.limit ?? correctLimit,
      remaining: data.remaining ?? correctLimit,
      resetAt: data.resetAt ?? null,
      firstRequestTime: Date.now(),
      initialized: true,
    });
  }
}

export function decrement(provider?: string, hasKey?: boolean) {
  const s = getCounter(provider, hasKey);
  if (s.remaining > 0) {
    s.remaining--;
  } else {
    // Queue when blocked (screenshotapi rate limit / monthly reset)
    enqueueCapture(provider, hasKey);
  }
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


// ScreenshotAPI queue system
export const captureQueue: Array<{ provider?: string; hasKey?: boolean }> = [];

export function enqueueCapture(provider?: string, hasKey?: boolean) {
  captureQueue.push({ provider, hasKey });
}

export function processCaptureQueue() {
  const s = getCounter('screenshotapi', false);
  if (captureQueue.length > 0 && s.remaining > 0) {
    s.remaining--;
    captureQueue.shift();
  }
  return captureQueue.length === 0;
}

export function getQueueLength() {
  return captureQueue.length;
}


// Auto-process capture queue every 30s (after resets / validation)
export function startQueueTimer() {
  setInterval(() => {
    processCaptureQueue();
  }, 8500);
}
