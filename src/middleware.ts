// In-memory middle-layer counter per package.docx
// First request retrieves endpoint headers; counts down; halts at 0; resets at endpoint reset

let counterState = {
  limit: 25, // default free tier (microlink / screenshotapi free)
  remaining: 25,
  resetAt: null as number | null,
  initialized: false,
  firstRequestTime: null as number | null, // timestamp of initial POST calibration for 60s countdown
};

export function getCounter() { return counterState; }

export function initCounter(data: { limit?: number; remaining?: number; resetAt?: number }) {
  if (!counterState.initialized) {
    counterState.limit = data.limit ?? 25;
    counterState.remaining = data.remaining ?? 25;
    counterState.resetAt = data.resetAt ?? null;
    counterState.firstRequestTime = Date.now(); // record calibration time for 60s refresh sync
    counterState.initialized = true;
  }
}

// Decrement only when upstream GET returns true HTTP/2 200 — errors do not reduce balance
export function decrement() {
  if (counterState.remaining > 0) counterState.remaining--;
  return counterState.remaining;
}

// 60-second cooldown timer sync for ScreenshotAPI no-key (8 req/min)
export function getRefreshSeconds(): number {
  if (!counterState.firstRequestTime) return 60;
  const elapsed = Math.floor((Date.now() - counterState.firstRequestTime) / 1000);
  return Math.max(0, 60 - elapsed);
}

export function isBlocked() {
  return counterState.remaining <= 0;
}

export function resetCounter() {
  counterState.remaining = counterState.limit;
  counterState.initialized = false;
}
