import { describe, expect, it } from 'vitest';
import {
  bringForwardItems,
  bringToFrontItems,
  sendToBackItems,
} from '../../src/canvasZOrder';
import { clampItemToArtboard, snapPosition } from '../../src/artboardSnap';
import { makeZItems } from '../helpers/fixtures';

/**
 * Integration-style workflow coverage for canvas editing primitives
 * (undo/redo/save/import/export UI flows are covered in Playwright where mounted).
 */
describe('canvas editing workflows', () => {
  it('supports arrange → snap → clamp pipeline', () => {
    let items = makeZItems(['phone', 'tablet', 'watch']);
    items = bringForwardItems(items, 'phone')!;
    expect(items.map((i) => i.instanceId)).toEqual(['tablet', 'phone', 'watch']);
    items = bringToFrontItems(items, 'tablet')!;
    expect(items.at(-1)?.instanceId).toBe('tablet');
    items = sendToBackItems(items, 'tablet')!;
    expect(items[0]?.instanceId).toBe('tablet');

    const snapped = snapPosition(
      { displayWidth: 100, displayHeight: 200 },
      2,
      2,
      [],
      { width: 1280, height: 720 },
      0,
    );
    const clamped = clampItemToArtboard(
      {
        x: snapped.x - 5000,
        y: snapped.y - 5000,
        displayWidth: 100,
        displayHeight: 200,
      },
      { width: 1280, height: 720 },
    );
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });
});
