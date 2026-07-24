import { describe, expect, it, vi, beforeEach } from 'vitest';
import { downloadBlob } from '../../src/exportMockup';

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
});
