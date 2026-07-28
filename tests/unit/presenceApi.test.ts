import { describe, expect, it, beforeEach } from 'vitest';
import handler from '../../api/presence';
import { PresenceStore } from '../../src/presenceStore';

type FakeRes = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => FakeRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

function createRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
    },
  };
  return res;
}

describe('api/presence handler', () => {
  beforeEach(() => {
    const g = globalThis as typeof globalThis & {
      __pixelMockupPresenceStore?: PresenceStore;
    };
    g.__pixelMockupPresenceStore = new PresenceStore();
  });

  it('returns count on GET', () => {
    const res = createRes();
    handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ count: 0 });
  });

  it('heartbeats a valid session on POST', () => {
    const res = createRes();
    handler(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://pixelmockup.vercel.app',
          host: 'pixelmockup.vercel.app',
        },
        body: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ count: 1 });
  });

  it('rejects cross-origin POST', () => {
    const res = createRes();
    handler(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          host: 'pixelmockup.vercel.app',
        },
        body: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});
