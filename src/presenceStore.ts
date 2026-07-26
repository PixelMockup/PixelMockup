/**
 * In-memory anonymous presence sessions.
 * Used by the Vite middleware (and unit tests). No PII — opaque IDs only.
 */

export const PRESENCE_TTL_MS = 60_000;
export const PRESENCE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidPresenceId(id: unknown): id is string {
  return typeof id === 'string' && PRESENCE_ID_RE.test(id);
}

export class PresenceStore {
  private readonly sessions = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = PRESENCE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** Touch a session heartbeat; returns active count after prune. */
  heartbeat(id: string, now = Date.now()): number {
    this.sessions.set(id, now);
    return this.count(now);
  }

  /** Drop a session early (e.g. page unload). */
  leave(id: string, now = Date.now()): number {
    this.sessions.delete(id);
    return this.count(now);
  }

  count(now = Date.now()): number {
    this.prune(now);
    return this.sessions.size;
  }

  prune(now = Date.now()): void {
    const cutoff = now - this.ttlMs;
    for (const [id, last] of this.sessions) {
      if (last < cutoff) this.sessions.delete(id);
    }
  }
}
