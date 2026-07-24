import { describe, expect, it } from 'vitest';
import {
  bringForwardItems,
  bringToFrontItems,
  byZ,
  pushBackwardItems,
  reindexZ,
  selectedZRank,
  sendToBackItems,
} from '../../src/canvasZOrder';
import { makeZItems } from '../helpers/fixtures';

describe('canvasZOrder', () => {
  it('reindexes contiguous z values', () => {
    expect(reindexZ(makeZItems(['a', 'b', 'c']))).toEqual([
      { instanceId: 'a', zIndex: 0 },
      { instanceId: 'b', zIndex: 1 },
      { instanceId: 'c', zIndex: 2 },
    ]);
  });

  it('sorts by zIndex without mutating', () => {
    const items = [
      { instanceId: 'c', zIndex: 2 },
      { instanceId: 'a', zIndex: 0 },
      { instanceId: 'b', zIndex: 1 },
    ];
    expect(byZ(items).map((i) => i.instanceId)).toEqual(['a', 'b', 'c']);
    expect(items[0].instanceId).toBe('c');
  });

  it('bringForward swaps with next layer', () => {
    const next = bringForwardItems(makeZItems(['a', 'b', 'c']), 'a');
    expect(next?.map((i) => i.instanceId)).toEqual(['b', 'a', 'c']);
  });

  it('bringForward returns null at top or missing', () => {
    expect(bringForwardItems(makeZItems(['a', 'b']), 'b')).toBeNull();
    expect(bringForwardItems(makeZItems(['a']), 'missing')).toBeNull();
    expect(bringForwardItems([], 'a')).toBeNull();
  });

  it('pushBackward swaps with previous layer', () => {
    const next = pushBackwardItems(makeZItems(['a', 'b', 'c']), 'c');
    expect(next?.map((i) => i.instanceId)).toEqual(['a', 'c', 'b']);
  });

  it('pushBackward returns null at bottom', () => {
    expect(pushBackwardItems(makeZItems(['a', 'b']), 'a')).toBeNull();
  });

  it('bringToFront moves item to end', () => {
    const next = bringToFrontItems(makeZItems(['a', 'b', 'c']), 'a');
    expect(next?.map((i) => i.instanceId)).toEqual(['b', 'c', 'a']);
  });

  it('sendToBack moves item to start', () => {
    const next = sendToBackItems(makeZItems(['a', 'b', 'c']), 'c');
    expect(next?.map((i) => i.instanceId)).toEqual(['c', 'a', 'b']);
  });

  it('selectedZRank handles null and missing', () => {
    expect(selectedZRank(makeZItems(['a', 'b']), null)).toEqual({
      index: -1,
      max: -1,
    });
    expect(selectedZRank(makeZItems(['a', 'b']), 'b')).toEqual({
      index: 1,
      max: 1,
    });
    expect(selectedZRank(makeZItems(['a', 'b']), 'x').index).toBe(-1);
  });
});
