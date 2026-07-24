import { describe, expect, it, vi } from 'vitest';
import { getImageContentBounds } from '../../src/imageContentBounds';

describe('imageContentBounds', () => {
  it('returns full bounds when image fails to load', async () => {
    vi.stubGlobal(
      'Image',
      class {
        decoding = 'async';
        naturalWidth = 0;
        naturalHeight = 0;
        set src(_v: string) {
          queueMicrotask(() => {
            this.onerror?.(new Event('error'));
          });
        }
        onload: ((ev: Event) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
      },
    );

    const bounds = await getImageContentBounds('broken://image');
    expect(bounds.width).toBeGreaterThanOrEqual(1);
    expect(bounds.height).toBeGreaterThanOrEqual(1);
  });

  it('memoizes by src', async () => {
    let loads = 0;
    vi.stubGlobal(
      'Image',
      class {
        decoding = 'async';
        naturalWidth = 0;
        naturalHeight = 0;
        set src(_v: string) {
          loads += 1;
          queueMicrotask(() => {
            this.onerror?.(new Event('error'));
          });
        }
        onload: ((ev: Event) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
      },
    );

    const src = `memo://${Math.random()}`;
    await Promise.all([getImageContentBounds(src), getImageContentBounds(src)]);
    expect(loads).toBe(1);
  });
});
