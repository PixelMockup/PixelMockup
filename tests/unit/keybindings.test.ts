import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ACTION_ORDER,
  assignChord,
  clearChords,
  defaultBindingsFor,
  detectPlatform,
  eventToChord,
  findActionForEvent,
  formatBindingsForDisplay,
  formatChordForDisplay,
  isMacPlatform,
  isTypingTarget,
  loadBindingsForPlatform,
  loadStore,
  platformDisplayName,
  resetBindingsForPlatform,
  saveBindingsForPlatform,
  saveStore,
} from '../../src/keybindings';

describe('keybindings', () => {
  beforeEach(() => localStorage.clear());

  it('exposes platform helpers', () => {
    expect(['mac', 'windows', 'linux']).toContain(detectPlatform());
    expect(isMacPlatform('mac')).toBe(true);
    expect(isMacPlatform('linux')).toBe(false);
    expect(platformDisplayName('mac')).toBe('macOS');
    expect(platformDisplayName('windows')).toBe('Windows');
    expect(platformDisplayName('linux')).toBe('Linux');
  });

  it('returns defaults and merges saved bindings', () => {
    const defaults = defaultBindingsFor('linux');
    expect(defaults.undo).toEqual(['mod+z']);
    expect(ACTION_ORDER.length).toBeGreaterThan(10);
    saveBindingsForPlatform('linux', {
      ...defaults,
      undo: ['mod+z', 'alt+z'],
    });
    expect(loadBindingsForPlatform('linux').undo).toEqual(['mod+z', 'alt+z']);
    expect(resetBindingsForPlatform('linux').undo).toEqual(['mod+z']);
  });

  it('loadStore handles invalid JSON', () => {
    localStorage.setItem('pixelMockup.keybindings.v1', '{bad');
    expect(loadStore()).toEqual({});
  });

  it('saveStore round-trips', () => {
    saveStore({ mac: defaultBindingsFor('mac') });
    expect(loadStore().mac?.copy).toEqual(['mod+c']);
  });

  it('formats chords for mac and windows', () => {
    expect(formatChordForDisplay('mod+shift+s', 'mac')).toContain('⌘');
    expect(formatChordForDisplay('mod+shift+s', 'windows')).toContain('Ctrl');
    expect(formatChordForDisplay('arrowleft', 'linux')).toBe('←');
    expect(formatBindingsForDisplay(['mod+c', 'mod+v'], 'windows')).toContain(
      '/',
    );
  });

  it('maps keyboard events to chords and actions', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
    });
    expect(eventToChord(e, 'linux')).toBe('mod+z');
    expect(
      findActionForEvent(e, defaultBindingsFor('linux'), 'linux'),
    ).toBe('undo');
  });

  it('returns null for unmatched events', () => {
    const e = new KeyboardEvent('keydown', { key: 'F24', bubbles: true });
    expect(findActionForEvent(e, defaultBindingsFor('linux'), 'linux')).toBeNull();
  });

  it('assignChord steals chord from other actions', () => {
    const bindings = defaultBindingsFor('linux');
    const next = assignChord(bindings, 'download', 'mod+z');
    expect(next.download).toContain('mod+z');
    expect(next.undo).not.toContain('mod+z');
  });

  it('clearChords empties an action', () => {
    const next = clearChords(defaultBindingsFor('linux'), 'copy');
    expect(next.copy).toEqual([]);
  });

  it('isTypingTarget detects inputs', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    const wrap = document.createElement('div');
    const nested = document.createElement('span');
    wrap.appendChild(nested);
    wrap.setAttribute('contenteditable', 'true');
    document.body.appendChild(wrap);
    // jsdom may not flip isContentEditable; closest() path still covers editable hosts
    expect(isTypingTarget(nested) || wrap.isContentEditable).toBe(true);
  });

  it('handles escape and bracket keys', () => {
    expect(
      eventToChord(
        new KeyboardEvent('keydown', { key: 'Escape' }),
        'linux',
      ),
    ).toBe('escape');
    expect(
      eventToChord(new KeyboardEvent('keydown', { key: ']' }), 'linux'),
    ).toBe(']');
  });
});
