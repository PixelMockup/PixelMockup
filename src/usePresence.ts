import { useEffect, useState } from 'react';
import { PRESENCE_PATH } from './presencePath';

const HEARTBEAT_MS = 20_000;
const SESSION_KEY = 'pixelMockup.presenceId';

function readOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        existing,
      )
    ) {
      return existing;
    }
  } catch {
    // ignore
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

async function postPresence(
  id: string,
  action?: 'leave',
): Promise<number | null> {
  try {
    const res = await fetch(PRESENCE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action ? { id, action } : { id }),
      keepalive: action === 'leave',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: unknown };
    return typeof data.count === 'number' && Number.isFinite(data.count)
      ? Math.max(0, Math.floor(data.count))
      : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous concurrent-user counter. Returns null when the presence
 * endpoint is unavailable (e.g. static production host without middleware).
 */
export function usePresence(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = readOrCreateSessionId();

    const tick = async () => {
      const next = await postPresence(id);
      if (!cancelled) setCount(next);
    };

    void tick();
    const timer = window.setInterval(() => void tick(), HEARTBEAT_MS);

    const onLeave = () => {
      void postPresence(id, 'leave');
    };
    window.addEventListener('pagehide', onLeave);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onLeave);
      void postPresence(id, 'leave');
    };
  }, []);

  return count;
}
