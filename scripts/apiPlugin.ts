import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handler as validateHandler } from '../api/validate.js';
import { handler as screenshotapiHandler } from '../api/screenshotapi.js';
import { handler as microlinkHandler } from '../api/microlink-capture.js';

type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  writeHead: (statusCode: number, headers?: Record<string, string>) => void;
  write: (chunk: string | Uint8Array) => void;
  end: (chunk?: string) => void;
  json: (body: unknown) => void;
};

type ApiHandler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Wrap an underlying Node ServerResponse with the .status()/.json() surface
 * the serverless handlers expect. Binary paths pass straight through to the
 * real response via writeHead/write/end.
 */
function adaptResponse(raw: ServerResponse): VercelResponse {
  let statusCode = 200;
  const chain: VercelResponse = {
    status(code) {
      statusCode = code;
      return chain;
    },
    setHeader(name, value) {
      raw.setHeader(name, value);
    },
    writeHead(code, headers) {
      raw.writeHead(code, headers ?? {});
    },
    write(chunk) {
      raw.write(chunk);
    },
    end(chunk) {
      raw.end(chunk);
    },
    json(body) {
      raw.statusCode = statusCode;
      raw.end(JSON.stringify(body));
    },
  };
  return chain;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('body too large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const ROUTES: Record<string, { handler: ApiHandler; methods: ReadonlySet<string> }> = {
  '/api/validate': { handler: validateHandler, methods: new Set(['POST']) },
  '/api/screenshotapi': { handler: screenshotapiHandler, methods: new Set(['GET']) },
  '/api/microlink-capture': { handler: microlinkHandler, methods: new Set(['GET']) },
};

function pathnameFrom(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://local').pathname;
  } catch {
    return url ?? '/';
  }
}

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = pathnameFrom(req.url);
  const route = ROUTES[pathname];
  if (!route) return false;

  const method = (req.method ?? 'GET').toUpperCase();
  if (!route.methods.has(method)) {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  const adaptedReq: VercelRequest = {
    method: req.method,
    url: req.url,
    headers: req.headers as Record<string, string | string[] | undefined>,
  };
  // Only the POST (validate) handler needs a parsed body; read it here.
  if (method === 'POST') {
    adaptedReq.body = await readBody(req);
  }

  await route.handler(adaptedReq, adaptResponse(res));
  return true;
}

/**
 * Mounts the Vercel serverless `api/*` handlers on the Vite dev/preview server
 * so local `npm run dev` behaves like the deployed environment for screenshot
 * providers and key validation.
 */
export function apiPlugin(): Plugin {
  const attach = (server: {
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => Promise<void> | void,
      ) => void;
    };
  }) => {
    server.middlewares.use(async (req, res, next) => {
      try {
        const handled = await dispatch(req, res);
        if (!handled) next();
      } catch (err) {
        console.error('[pixel-mockup-api]', err);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: err instanceof Error ? err.message : 'API function failed',
          }));
        } else {
          next();
        }
      }
    });
  };

  return {
    name: 'pixel-mockup-api',
    configureServer(server) {
      attach(server);
    },
    configurePreviewServer(server) {
      attach(server);
    },
  };
}
