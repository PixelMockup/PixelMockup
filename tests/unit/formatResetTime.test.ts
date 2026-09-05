// tests/unit/formatResetTime.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { formatResetTime } from '../../src/utils/formatResetTime';

const BASE_MS = 1_700_000_000_000; // a fixed reference "now"
const BASE_SEC = Math.floor(BASE_MS / 1000);

describe('formatResetTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns UTC reset time when diff is 0 or negative', () => {
    // Updated to match the new explicit UTC output instead of "Resets momentarily"
    const result1 = formatResetTime(BASE_SEC);
    expect(result1).toMatch(/Reset window reached \(UTC: \d{1,2}:\d{2}\)/);

    const result2 = formatResetTime(BASE_SEC - 10);
    expect(result2).toMatch(/Reset window reached \(UTC: \d{1,2}:\d{2}\)/);
  });

  it('formats hours + minutes when > 1 hour', () => {
    const resetAt = BASE_SEC + 2 * 3600 + 15 * 60;
    const result = formatResetTime(resetAt);
    expect(result).toMatch(/Resets in 2h 15m/);
    expect(result).toMatch(/\(UTC: \d{1,2}:\d{2}\)$/);
  });

  it('formats minutes only when under 1 hour', () => {
    const resetAt = BASE_SEC + 45 * 60;
    const result = formatResetTime(resetAt);
    expect(result).toMatch(/Resets in 45m/);
  });
});