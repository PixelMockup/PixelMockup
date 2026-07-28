import {
  isValidPresenceId,
  PresenceStore,
} from '../src/presenceStore.js';

type PresenceBody = {
  id?: string;
  action?: string;
};

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

type PresenceGlobal = typeof globalThis & {
  __pixelMockupPresenceStore?: PresenceStore;
};

function getStore(): PresenceStore {
  const g = globalThis as PresenceGlobal;
  if (!g.__pixelMockupPresenceStore) {
    g.__pixelMockupPresenceStore = new PresenceStore();
  }
  return g.__pixelMockupPresenceStore;
}

function headerValue(
  headers: VercelRequest['headers'],
  name: string,
): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

function isSameOrigin(req: VercelRequest): boolean {
  const origin = headerValue(req.headers, 'origin');
  if (!origin) return false;
  const host = headerValue(req.headers, 'host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Vercel serverless: anonymous concurrent-user presence.
 * GET/POST /api/presence → { count }
 *
 * In-memory store is best-effort across warm instances (not a global durable counter).
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  const store = getStore();

  if (req.method === 'GET') {
    res.status(200).json({ count: store.count() });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const contentType = headerValue(req.headers, 'content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    res.status(415).json({ error: 'application/json required' });
    return;
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'forbidden origin' });
    return;
  }

  const body = (req.body ?? {}) as PresenceBody;
  if (!isValidPresenceId(body.id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const count =
    body.action === 'leave' ? store.leave(body.id) : store.heartbeat(body.id);
  res.status(200).json({ count });
}
