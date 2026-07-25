import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  downloadBlob,
  getFullBleedScreenPlacement,
} from '../../src/exportMockup';

describe('exportMockup helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloadBlob creates and revokes object URL', () => {
    const click = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click });
      }
      return el;
    });
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    downloadBlob(new Blob(['x'], { type: 'image/png' }), 'mockup.png');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('places screen content across the full device display rect', () => {
    const placement = getFullBleedScreenPlacement(
      1920,
      1080,
      120,
      80,
      640,
      480,
    );

    expect(placement.destination).toEqual({
      x: 120,
      y: 80,
      width: 640,
      height: 480,
    });
    expect(placement.crop.width / placement.crop.height).toBeCloseTo(
      640 / 480,
      6,
    );
  });

  it('keeps full-bleed crop inside the source while panning and zooming', () => {
    const { crop } = getFullBleedScreenPlacement(
      1200,
      800,
      0,
      0,
      400,
      700,
      1,
      -1,
      2,
    );

    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1200);
    expect(crop.y + crop.height).toBeLessThanOrEqual(800);
  });
});
