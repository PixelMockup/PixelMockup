import { describe, expect, it } from 'vitest';
import {
  isValidPresenceId,
  PresenceStore,
  PRESENCE_TTL_MS,
} from '../../src/presenceStore';

describe('isValidPresenceId', () => {
  it('accepts UUID v4-shaped ids', () => {
    expect(isValidPresenceId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      true,
    );
  });

  it('rejects non-uuid and non-strings', () => {
    expect(isValidPresenceId('not-a-uuid')).toBe(false);
    expect(isValidPresenceId('')).toBe(false);
    expect(isValidPresenceId(null)).toBe(false);
    expect(isValidPresenceId(123)).toBe(false);
  });
});

describe('PresenceStore', () => {
  it('counts distinct heartbeats', () => {
    const store = new PresenceStore();
    const t0 = 1_000_000;
    expect(store.heartbeat('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', t0)).toBe(
      1,
    );
    expect(store.heartbeat('11111111-2222-3333-4444-555555555555', t0 + 10)).toBe(
      2,
    );
    expect(store.heartbeat('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', t0 + 20)).toBe(
      2,
    );
  });

  it('expires sessions after TTL', () => {
    const store = new PresenceStore(PRESENCE_TTL_MS);
    const t0 = 1_000_000;
    store.heartbeat('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', t0);
    expect(store.count(t0 + PRESENCE_TTL_MS - 1)).toBe(1);
    expect(store.count(t0 + PRESENCE_TTL_MS + 1)).toBe(0);
  });

  it('leave removes a session immediately', () => {
    const store = new PresenceStore();
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    store.heartbeat(id, 1000);
    expect(store.leave(id, 1001)).toBe(0);
  });
});
