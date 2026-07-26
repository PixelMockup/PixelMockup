import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { PRESENCE_PATH } from '../src/presencePath.js';
import {
  isValidPresenceId,
  PresenceStore,
} from '../src/presenceStore.js';

const MAX_BODY_BYTES = 4 * 1024;

type PresenceBody = {
  id?: string;
  action?: string;
};

function respondJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readJsonBody(req: IncomingMessage): Promise<PresenceBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as PresenceBody) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Vite middleware: anonymous concurrent-user presence.
 * POST /__presence { id, action?: "leave" } → { count }
 * GET  /__presence → { count }
 */
export function presencePlugin(): Plugin {
  const store = new PresenceStore();

  const attach = (server: {
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
  }) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith(PRESENCE_PATH)) {
        next();
        return;
      }

      if (req.method === 'GET') {
        respondJson(res, 200, { count: store.count() });
        return;
      }

      if (req.method !== 'POST') {
        respondJson(res, 405, { error: 'method not allowed' });
        return;
      }

      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.toLowerCase().startsWith('application/json')) {
        respondJson(res, 415, { error: 'application/json required' });
        return;
      }
      if (!isSameOrigin(req)) {
        respondJson(res, 403, { error: 'forbidden origin' });
        return;
      }

      try {
        const body = await readJsonBody(req);
        if (!isValidPresenceId(body.id)) {
          respondJson(res, 400, { error: 'invalid id' });
          return;
        }
        const count =
          body.action === 'leave'
            ? store.leave(body.id)
            : store.heartbeat(body.id);
        respondJson(res, 200, { count });
      } catch {
        respondJson(res, 400, { error: 'bad request' });
      }
    });
  };

  return {
    name: 'pixel-mockup-presence',
    configureServer(server) {
      attach(server);
    },
    configurePreviewServer(server) {
      attach(server);
    },
  };
}
