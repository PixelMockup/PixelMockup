// Server-side in-memory credit storage with auto-reset logic
// Note: Vercel serverless = memory not persistent across all instances,
// but works within same container and provides real-time sync.

export interface CreditStoreState {
  remaining: number;
  limit: number;
  resetAt: number | null; // Unix epoch in seconds
  lastUpdated: number; // Unix epoch ms
  provider: 'microlink' | 'screenshotapi';
}

const store: Record<string, CreditStoreState | undefined> = {};

export function getCreditState(provider: 'microlink' | 'screenshotapi', key?: string): CreditStoreState | null {
  const id = provider === 'screenshotapi' && key ? `sa:${key}` : 'ml:shared';
  const state = store[id];
  if (!state) return null;

  const nowSec = Math.floor(Date.now() / 1000);

  // Auto-reset logic: if resetAt has passed, reset to full amount
  if (state.resetAt && state.resetAt > 0 && nowSec >= state.resetAt) {
    state.remaining = state.limit;
    state.resetAt = null; // Will be refreshed on next live probe
    state.lastUpdated = Date.now();
  }

  return { ...state };
}

export function setCreditState(
  provider: 'microlink' | 'screenshotapi',
  remaining: number | null,
  limit: number | null,
  resetAt: number | null,
  key?: string,
): void {
  const id = provider === 'screenshotapi' && key ? `sa:${key}` : 'ml:shared';
  store[id] = {
    remaining: remaining ?? (provider === 'microlink' ? 25 : 200),
    limit: limit ?? (provider === 'microlink' ? 25 : 200),
    resetAt: resetAt ?? null,
    lastUpdated: Date.now(),
    provider,
  };
}

export function resetCreditState(provider: 'microlink' | 'screenshotapi', key?: string): void {
  const id = provider === 'screenshotapi' && key ? `sa:${key}` : 'ml:shared';
  delete store[id];
}
