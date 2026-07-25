import { describe, expect, it } from 'vitest';
import {
  coverCropRect,
  coverCropRectWithFraming,
  expandScreenIntoDarkBorder,
  expandTransparentIntoLowAlpha,
  fallbackScreenBounds,
  isScreenAperturePixel,
  largestTransparentRect,
  largestWhiteRect,
  screenObjectPosition,
} from '../../src/deviceScreenBounds';
import type { ContentBounds } from '../../src/imageContentBounds';

/**
 * Build RGBA data from rows:
 * 'W' white opaque, '#' dark opaque, 'S' silver chassis,
 * 'a' low-alpha fringe (AA), '.' fully transparent.
 */
function rgbaFromRows(rows: string[]): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const ch = rows[y][x];
      if (ch === 'W') {
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = 255;
      } else if (ch === '#') {
        data[i] = data[i + 1] = data[i + 2] = 20;
        data[i + 3] = 255;
      } else if (ch === 'S') {
        data[i] = data[i + 1] = data[i + 2] = 180;
        data[i + 3] = 255;
      } else if (ch === 'a') {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 40;
      } else {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }
  return { data, width, height };
}

describe('largestWhiteRect', () => {
  it('finds a white screen inside a dark bezel', () => {
    const { data, width, height } = rgbaFromRows([
      '########',
      '#WWWWWW#',
      '#WWWWWW#',
      '#WWWWWW#',
      '########',
    ]);
    expect(largestWhiteRect(data, width, height)).toEqual({
      x: 1,
      y: 1,
      width: 6,
      height: 3,
    });
  });

  it('returns null when no white pixels exist', () => {
    const { data, width, height } = rgbaFromRows(['####', '####']);
    expect(largestWhiteRect(data, width, height)).toBeNull();
  });

  it('ignores transparent white pixels', () => {
    const { data, width, height } = rgbaFromRows(['....', '.WW.', '....']);
    expect(largestWhiteRect(data, width, height)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 1,
    });
  });

  it('picks the largest of multiple white regions', () => {
    const { data, width, height } = rgbaFromRows([
      'W#WWWW',
      '##WWWW',
      '##WWWW',
    ]);
    expect(largestWhiteRect(data, width, height)).toEqual({
      x: 2,
      y: 0,
      width: 4,
      height: 3,
    });
  });

  it('handles empty input', () => {
    expect(largestWhiteRect(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe('largestTransparentRect', () => {
  it('finds the transparent screen hole inside an opaque bezel', () => {
    // S = silver chassis, . = transparent screen, # = dark bezel
    const { data, width, height } = rgbaFromRows([
      'SSSSSSSS',
      'S######S',
      'S#....#S',
      'S#....#S',
      'S#....#S',
      'S######S',
      'SSSSSSSS',
    ]);
    const hole = largestTransparentRect(data, width, height, {
      x: 0,
      y: 0,
      width,
      height,
    });
    expect(hole).toEqual({ x: 2, y: 2, width: 4, height: 3 });
  });

  it('ignores transparent padding outside the limit', () => {
    const { data, width, height } = rgbaFromRows([
      '........',
      '..####..',
      '..#WW#..',
      '..#WW#..',
      '..####..',
      '........',
    ]);
    // Without a limit, outer padding is transparent.
    const full = largestTransparentRect(data, width, height);
    expect(full).not.toBeNull();

    // Limited to the device content: cells are # or W only — no hole.
    const limited = largestTransparentRect(data, width, height, {
      x: 2,
      y: 1,
      width: 4,
      height: 4,
    });
    expect(limited).toBeNull();
  });

  it('returns the full interior aperture touching all four bezel edges', () => {
    const { data, width, height } = rgbaFromRows([
      '########',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ]);
    const hole = largestTransparentRect(data, width, height);
    expect(hole).toEqual({ x: 1, y: 1, width: 6, height: 3 });
  });
});

describe('expandTransparentIntoLowAlpha', () => {
  it('absorbs low-alpha AA fringe around a clear hole up to the bezel', () => {
    // # = opaque bezel, a = AA fringe, . = clear hole
    const { data, width, height } = rgbaFromRows([
      '########',
      '#aaaaaa#',
      '#a....a#',
      '#a....a#',
      '#aaaaaa#',
      '########',
    ]);
    const hole = largestTransparentRect(data, width, height)!;
    expect(hole).toEqual({ x: 2, y: 2, width: 4, height: 2 });

    const expanded = expandTransparentIntoLowAlpha(data, width, height, hole);
    expect(expanded).toEqual({ x: 1, y: 1, width: 6, height: 4 });
  });

  it('does not expand into opaque chassis', () => {
    const { data, width, height } = rgbaFromRows([
      'SSSSSS',
      'S....S',
      'S....S',
      'SSSSSS',
    ]);
    const hole = largestTransparentRect(data, width, height)!;
    const expanded = expandTransparentIntoLowAlpha(data, width, height, hole);
    expect(expanded).toEqual(hole);
  });
});

describe('expandScreenIntoDarkBorder', () => {
  it('grows through a dark ring around white and stops at silver chassis', () => {
    // S = silver chassis, # = dark screen border, W = white LCD
    const { data, width, height } = rgbaFromRows([
      'SSSSSSSS',
      'S######S',
      'S#WWWW#S',
      'S#WWWW#S',
      'S######S',
      'SSSSSSSS',
    ]);
    const white = largestWhiteRect(data, width, height)!;
    expect(white).toEqual({ x: 2, y: 2, width: 4, height: 2 });

    const expanded = expandScreenIntoDarkBorder(data, width, height, white);
    expect(expanded).toEqual({ x: 1, y: 1, width: 6, height: 4 });
  });

  it('does not grow into transparent padding', () => {
    const { data, width, height } = rgbaFromRows([
      '........',
      '.#WWWW#.',
      '.#WWWW#.',
      '........',
    ]);
    const white = largestWhiteRect(data, width, height)!;
    const expanded = expandScreenIntoDarkBorder(data, width, height, white);
    expect(expanded).toEqual({ x: 1, y: 1, width: 6, height: 2 });
  });

  it('respects an explicit limit rect', () => {
    const { data, width, height } = rgbaFromRows([
      '########',
      '#WWWWWW#',
      '#WWWWWW#',
      '########',
    ]);
    const white = largestWhiteRect(data, width, height)!;
    const limited = expandScreenIntoDarkBorder(data, width, height, white, {
      x: 2,
      y: 1,
      width: 4,
      height: 2,
    });
    expect(limited.x).toBeGreaterThanOrEqual(2);
    expect(limited.x + limited.width).toBeLessThanOrEqual(6);
  });
});

describe('isScreenAperturePixel', () => {
  it('accepts white and dark, rejects silver', () => {
    const { data } = rgbaFromRows(['W#S']);
    expect(isScreenAperturePixel(data, 0)).toBe(true);
    expect(isScreenAperturePixel(data, 4)).toBe(true);
    expect(isScreenAperturePixel(data, 8)).toBe(false);
  });
});

describe('fallbackScreenBounds', () => {
  it('insets the content bounds on all sides', () => {
    const content: ContentBounds = { x: 10, y: 20, width: 100, height: 200 };
    const rect = fallbackScreenBounds(content);
    expect(rect.x).toBeGreaterThan(content.x);
    expect(rect.y).toBeGreaterThan(content.y);
    expect(rect.x + rect.width).toBeLessThan(content.x + content.width);
    expect(rect.y + rect.height).toBeLessThan(content.y + content.height);
  });

  it('never collapses to zero size', () => {
    const rect = fallbackScreenBounds({ x: 0, y: 0, width: 2, height: 2 });
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });
});

describe('coverCropRect', () => {
  it('returns the full source when aspect ratios match', () => {
    expect(coverCropRect(100, 50, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it('crops horizontally for a taller destination', () => {
    // Source 200x100 into square dest: crop width to 100, centered.
    expect(coverCropRect(200, 100, 100, 100)).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('crops vertically for a wider destination', () => {
    expect(coverCropRect(100, 200, 100, 100)).toEqual({
      x: 0,
      y: 50,
      width: 100,
      height: 100,
    });
  });

  it('crop always stays within the source image', () => {
    const cases: Array<[number, number, number, number]> = [
      [123, 456, 78, 90],
      [456, 123, 90, 78],
      [10, 10, 1000, 3],
    ];
    for (const [sw, sh, dw, dh] of cases) {
      const c = coverCropRect(sw, sh, dw, dh);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(sw + 1e-9);
      expect(c.y + c.height).toBeLessThanOrEqual(sh + 1e-9);
      // Crop keeps the destination aspect ratio.
      expect(c.width / c.height).toBeCloseTo(dw / dh, 6);
    }
  });

  it('degrades gracefully on zero-size input', () => {
    expect(coverCropRect(0, 0, 10, 10)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});

describe('coverCropRectWithFraming', () => {
  it('matches centered cover when framing is default', () => {
    expect(
      coverCropRectWithFraming(200, 100, 100, 100, {
        panX: 0,
        panY: 0,
        zoom: 1,
      }),
    ).toEqual(coverCropRect(200, 100, 100, 100));
  });

  it('shrinks the crop window when zoomed', () => {
    const base = coverCropRectWithFraming(200, 100, 100, 100, {
      panX: 0,
      panY: 0,
      zoom: 1,
    });
    const zoomed = coverCropRectWithFraming(200, 100, 100, 100, {
      panX: 0,
      panY: 0,
      zoom: 2,
    });
    expect(zoomed.width).toBeCloseTo(base.width / 2, 6);
    expect(zoomed.height).toBeCloseTo(base.height / 2, 6);
    expect(zoomed.width / zoomed.height).toBeCloseTo(100 / 100, 6);
  });

  it('keeps pan extremes inside the source', () => {
    for (const panX of [-1, 0, 1] as const) {
      for (const panY of [-1, 0, 1] as const) {
        const c = coverCropRectWithFraming(200, 100, 100, 100, {
          panX,
          panY,
          zoom: 1.5,
        });
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width).toBeLessThanOrEqual(200 + 1e-9);
        expect(c.y + c.height).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
  });

  it('pan -1 flush-left and pan 1 flush-right', () => {
    const left = coverCropRectWithFraming(200, 100, 100, 100, {
      panX: -1,
      panY: 0,
      zoom: 1,
    });
    const right = coverCropRectWithFraming(200, 100, 100, 100, {
      panX: 1,
      panY: 0,
      zoom: 1,
    });
    expect(left.x).toBeCloseTo(0, 6);
    expect(right.x + right.width).toBeCloseTo(200, 6);
  });
});

describe('screenObjectPosition', () => {
  it('maps pan -1…1 to 0%…100%', () => {
    expect(screenObjectPosition(-1, 1)).toEqual({ x: 0, y: 100 });
    expect(screenObjectPosition(0, 0)).toEqual({ x: 50, y: 50 });
    expect(screenObjectPosition(1, -1)).toEqual({ x: 100, y: 0 });
  });
});
