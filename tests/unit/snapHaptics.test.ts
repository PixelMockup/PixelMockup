import { describe, expect, it, vi } from 'vitest';
import { pulseSnapHaptic, snapGuidesLatchKey } from '../../src/snapHaptics';

describe('snapHaptics', () => {
  it('builds empty latch key for no guides', () => {
    expect(snapGuidesLatchKey({ vertical: [], horizontal: [] })).toBe('');
  });

  it('builds stable latch keys', () => {
    expect(
      snapGuidesLatchKey({
        vertical: [{ pos: 10, kind: 'page' }],
        horizontal: [{ pos: 20, kind: 'sibling' }],
      }),
    ).toBe('page:10|sibling:20');
  });

  it('pulseSnapHaptic never throws', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => true),
    });
    expect(() => pulseSnapHaptic()).not.toThrow();
  });

  it('falls back when vibrate returns false', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => false),
    });
    expect(() => pulseSnapHaptic()).not.toThrow();
  });
});
