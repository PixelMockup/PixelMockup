import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeybindings } from '../../src/useKeybindings';
import { defaultBindingsFor } from '../../src/keybindings';

describe('useKeybindings', () => {
  it('invokes handler for matching shortcut', () => {
    const undo = vi.fn();
    renderHook(() =>
      useKeybindings(
        defaultBindingsFor('linux'),
        { undo },
        { platform: 'linux', enabled: true },
      ),
    );

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts while typing in inputs', () => {
    const undo = vi.fn();
    renderHook(() =>
      useKeybindings(defaultBindingsFor('linux'), { undo }, { platform: 'linux' }),
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    // listener is on window; synthesize with target input via Object.defineProperty
    const e = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(e, 'target', { value: input });
    window.dispatchEvent(e);
    expect(undo).not.toHaveBeenCalled();
  });

  it('can be disabled', () => {
    const undo = vi.fn();
    renderHook(() =>
      useKeybindings(
        defaultBindingsFor('linux'),
        { undo },
        { platform: 'linux', enabled: false },
      ),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(undo).not.toHaveBeenCalled();
  });
});
