import { describe, expect, it } from 'vitest';
import {
  getCatalogScreenRect,
  mapScreenRectToDisplay,
  screenClipInsetCss,
} from '../../src/deviceScreens';
import { getClippedScreenPlacement } from '../../src/exportMockup';

describe('deviceScreens catalog map', () => {
  it('loads a known phone screen rect from deviceScreens.json', () => {
    const screen = getCatalogScreenRect('phones/Apple iPhone 11 Black.svg');
    expect(screen).not.toBeNull();
    expect(screen!.width).toBeGreaterThan(700);
    expect(screen!.height).toBeGreaterThan(1500);
    expect(screen!.rx).toBeGreaterThan(0);
  });

  it('returns null for unknown catalog keys', () => {
    expect(getCatalogScreenRect('phones/No Such Device.svg')).toBeNull();
    expect(getCatalogScreenRect(undefined)).toBeNull();
  });
});

describe('screenClipInsetCss', () => {
  it('maps native screen rect into inset clip-path within contentBounds', () => {
    const content = { x: 10, y: 20, width: 200, height: 400 };
    const screen = { x: 30, y: 60, width: 160, height: 320, rx: 0 };
    const { clipPath } = screenClipInsetCss(screen, content);

    // left=(30-10)/200=10%, top=(60-20)/400=10%,
    // right=(210-190)/200=10%, bottom=(420-380)/400=10%
    expect(clipPath).toBe('inset(10% 10% 10% 10%)');
  });

  it('includes round radii for phone-like screens', () => {
    const content = { x: 0, y: 0, width: 100, height: 200 };
    const screen = { x: 10, y: 20, width: 80, height: 160, rx: 8 };
    const { clipPath } = screenClipInsetCss(screen, content);
    expect(clipPath).toContain('round');
    expect(clipPath.startsWith('inset(')).toBe(true);
  });

  it('keeps inset edges non-negative when screen sits inside content', () => {
    const content = { x: 50, y: 40, width: 500, height: 900 };
    const screen = getCatalogScreenRect('phones/Apple iPhone 11 Black.svg')!;
    // Use a content rect that contains the screen.
    const containing = {
      x: Math.min(content.x, screen.x),
      y: Math.min(content.y, screen.y),
      width: Math.max(content.x + content.width, screen.x + screen.width) -
        Math.min(content.x, screen.x),
      height:
        Math.max(content.y + content.height, screen.y + screen.height) -
        Math.min(content.y, screen.y),
    };
    const { clipPath } = screenClipInsetCss(screen, containing);
    const nums = clipPath
      .replace('inset(', '')
      .replace(/round.*/, '')
      .replace(')', '')
      .trim()
      .split(/\s+/)
      .map((p) => Number.parseFloat(p));
    expect(nums.length).toBeGreaterThanOrEqual(4);
    for (const n of nums.slice(0, 4)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});

describe('mapScreenRectToDisplay', () => {
  it('scales screen rect into the display frame relative to contentBounds', () => {
    const content = { x: 100, y: 50, width: 400, height: 800 };
    const screen = { x: 140, y: 130, width: 320, height: 640, rx: 20 };
    const mapped = mapScreenRectToDisplay(screen, content, 10, 20, 200, 400);

    expect(mapped.x).toBeCloseTo(10 + ((140 - 100) / 400) * 200, 6);
    expect(mapped.y).toBeCloseTo(20 + ((130 - 50) / 800) * 400, 6);
    expect(mapped.width).toBeCloseTo((320 / 400) * 200, 6);
    expect(mapped.height).toBeCloseTo((640 / 800) * 400, 6);
    expect(mapped.rx).toBeCloseTo(20 * Math.min(200 / 400, 400 / 800), 6);
  });

  it('keeps mapped screen inside the display rect', () => {
    const content = { x: 0, y: 0, width: 1000, height: 2000 };
    const screen = { x: 80, y: 120, width: 840, height: 1760, rx: 40 };
    const mapped = mapScreenRectToDisplay(screen, content, 0, 0, 250, 500);

    expect(mapped.x).toBeGreaterThanOrEqual(0);
    expect(mapped.y).toBeGreaterThanOrEqual(0);
    expect(mapped.x + mapped.width).toBeLessThanOrEqual(250 + 1e-6);
    expect(mapped.y + mapped.height).toBeLessThanOrEqual(500 + 1e-6);
  });
});

describe('getClippedScreenPlacement', () => {
  it('cover-fits (slice) into the clipped destination', () => {
    const placement = getClippedScreenPlacement(
      1920,
      1080,
      { x: 40, y: 60, width: 320, height: 640 },
    );
    expect(placement.destination).toEqual({
      x: 40,
      y: 60,
      width: 320,
      height: 640,
    });
    expect(placement.crop.width / placement.crop.height).toBeCloseTo(
      320 / 640,
      6,
    );
  });
});
