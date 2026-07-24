import { describe, expect, it, beforeEach } from 'vitest';
import {
  alignBox,
  artboardWidthCss,
  clampItemToArtboard,
  clampSnapMargin,
  DEFAULT_SNAP_MARGIN,
  NO_GUIDES,
  persistSnapEnabled,
  persistSnapMargin,
  readSnapEnabled,
  readSnapMargin,
  SNAP_MARGIN_MAX,
  snapPosition,
  stepViewZoom,
  viewZoomLabel,
} from '../../src/artboardSnap';

describe('artboardSnap', () => {
  beforeEach(() => localStorage.clear());

  describe('clampSnapMargin', () => {
    it('clamps finite values into range', () => {
      expect(clampSnapMargin(-10)).toBe(0);
      expect(clampSnapMargin(40)).toBe(40);
      expect(clampSnapMargin(999)).toBe(SNAP_MARGIN_MAX);
      expect(clampSnapMargin(40.6)).toBe(41);
    });

    it('falls back for non-finite input', () => {
      expect(clampSnapMargin(Number.NaN)).toBe(DEFAULT_SNAP_MARGIN);
      expect(clampSnapMargin(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SNAP_MARGIN);
    });
  });

  describe('snapPosition', () => {
    it('returns unchanged coords when far from targets', () => {
      const result = snapPosition(
        { displayWidth: 100, displayHeight: 200 },
        333,
        222,
        [],
        { width: 1280, height: 720 },
        0,
      );
      expect(result.x).toBe(333);
      expect(result.y).toBe(222);
      expect(result.guides).toEqual(NO_GUIDES);
    });

    it('snaps to page center within threshold', () => {
      const result = snapPosition(
        { displayWidth: 100, displayHeight: 100 },
        640 - 50 + 3,
        100,
        [],
        { width: 1280, height: 720 },
        0,
      );
      expect(result.x).toBeCloseTo(590, 5);
      expect(result.guides.vertical.length).toBe(1);
      expect(result.guides.vertical[0].kind).toBe('page');
    });

    it('prefers page over sibling on equal distance', () => {
      const result = snapPosition(
        { displayWidth: 100, displayHeight: 100 },
        5,
        5,
        [{ x: 0, y: 0, displayWidth: 100, displayHeight: 100 }],
        { width: 1280, height: 720 },
        0,
      );
      expect(result.guides.vertical[0]?.kind).toBe('page');
    });

    it('handles empty siblings and default board', () => {
      const result = snapPosition({ displayWidth: 10, displayHeight: 10 }, 0, 0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });

  describe('alignBox', () => {
    const item = { x: 10, y: 20, displayWidth: 100, displayHeight: 50 };
    const board = { width: 1000, height: 500 };

    it('centers horizontally', () => {
      expect(alignBox(item, 'center', board)).toEqual({ x: 450, y: 20 });
    });

    it('middle aligns vertically', () => {
      expect(alignBox(item, 'middle', board)).toEqual({ x: 10, y: 225 });
    });

    it('bottom aligns to artboard bottom', () => {
      expect(alignBox(item, 'bottom', board)).toEqual({ x: 10, y: 450 });
    });
  });

  describe('clampItemToArtboard', () => {
    it('clamps overflowing item into board', () => {
      const next = clampItemToArtboard(
        { x: -100, y: -50, displayWidth: 200, displayHeight: 100 },
        { width: 1280, height: 720 },
      );
      expect(next.x).toBe(0);
      expect(next.y).toBe(0);
    });

    it('keeps item already inside', () => {
      const item = { x: 10, y: 20, displayWidth: 100, displayHeight: 100 };
      expect(clampItemToArtboard(item, { width: 1280, height: 720 })).toEqual(item);
    });

    it('handles item larger than board', () => {
      const next = clampItemToArtboard(
        { x: 10, y: 10, displayWidth: 2000, displayHeight: 2000 },
        { width: 100, height: 100 },
      );
      expect(next.x).toBe(0);
      expect(next.y).toBe(0);
    });
  });

  describe('snap persistence', () => {
    it('defaults enabled and migrates legacy', () => {
      expect(readSnapEnabled()).toBe(true);
      localStorage.setItem('mockupStudio.snapEnabled', '0');
      expect(readSnapEnabled()).toBe(false);
      persistSnapEnabled(true);
      expect(localStorage.getItem('pixelMockup.snapEnabled')).toBe('1');
    });

    it('reads and persists margin', () => {
      expect(readSnapMargin()).toBe(DEFAULT_SNAP_MARGIN);
      persistSnapMargin(55);
      expect(readSnapMargin()).toBe(55);
      localStorage.setItem('mockupStudio.snapMargin', '12');
      localStorage.removeItem('pixelMockup.snapMargin');
      expect(readSnapMargin()).toBe(12);
    });
  });

  describe('view zoom helpers', () => {
    it('labels known zooms', () => {
      expect(viewZoomLabel('fit')).toBe('Fit');
      expect(viewZoomLabel(0.5)).toBe('50%');
      expect(viewZoomLabel(1)).toBe('100%');
      expect(viewZoomLabel(1.5)).toBe('150%');
    });

    it('steps within bounds', () => {
      expect(stepViewZoom('fit', 1)).toBe(0.5);
      expect(stepViewZoom(1.5, 1)).toBe(1.5);
      expect(stepViewZoom('fit', -1)).toBe('fit');
    });

    it('builds artboard width css', () => {
      expect(artboardWidthCss('fit')).toContain('100cqh');
      expect(artboardWidthCss(1)).toContain('1280px');
    });
  });
});
