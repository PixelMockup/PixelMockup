import { describe, expect, it, beforeEach } from 'vitest';
import {
  storageGet,
  storageSet,
  validateStorageValue,
} from '../../src/storage';

describe('storageGet / storageSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when neither key exists', () => {
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBeNull();
  });

  it('returns new key when present', () => {
    localStorage.setItem('pixelMockup.theme', 'dark');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('dark');
  });

  it('falls back to legacy and migrates allowlisted theme', () => {
    localStorage.setItem('mockupStudio.theme', 'light');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('light');
    expect(localStorage.getItem('pixelMockup.theme')).toBe('light');
  });

  it('does not migrate or return disallowed legacy theme values', () => {
    localStorage.setItem('mockupStudio.theme', '<script>alert(1)</script>');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBeNull();
    expect(localStorage.getItem('pixelMockup.theme')).toBeNull();
  });

  it('returns null for poisoned values already under the new key', () => {
    localStorage.setItem('pixelMockup.theme', 'neon');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBeNull();
  });

  it('prefers new key over legacy', () => {
    localStorage.setItem('pixelMockup.theme', 'dark');
    localStorage.setItem('mockupStudio.theme', 'light');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('dark');
  });

  it('stores empty string values for unknown pixelMockup keys are rejected', () => {
    storageSet('pixelMockup.x', '');
    expect(localStorage.getItem('pixelMockup.x')).toBeNull();
  });

  it('rejects unicode values for unknown pixelMockup keys', () => {
    storageSet('pixelMockup.x', 'こんにちは🎨');
    expect(localStorage.getItem('pixelMockup.x')).toBeNull();
  });

  it('rejects long values for unknown pixelMockup keys', () => {
    const long = 'a'.repeat(50_000);
    storageSet('pixelMockup.x', long);
    expect(localStorage.getItem('pixelMockup.x')).toBeNull();
  });

  it('rejects disallowed theme values', () => {
    storageSet('pixelMockup.theme', 'neon');
    expect(localStorage.getItem('pixelMockup.theme')).toBeNull();
  });

  it('accepts allowlisted theme values', () => {
    storageSet('pixelMockup.theme', 'dark');
    expect(localStorage.getItem('pixelMockup.theme')).toBe('dark');
  });

  it('rejects writes to keys outside the namespace', () => {
    storageSet('evil.key', 'dark');
    expect(localStorage.getItem('evil.key')).toBeNull();
  });

  it('clamps library width into range', () => {
    storageSet('pixelMockup.libraryWidth', '9999');
    expect(localStorage.getItem('pixelMockup.libraryWidth')).toBe('720');
    storageSet('pixelMockup.libraryWidth', '10');
    expect(localStorage.getItem('pixelMockup.libraryWidth')).toBe('280');
  });

  it('survives legacy migration quota failure', () => {
    localStorage.setItem('mockupStudio.theme', 'dark');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'pixelMockup.theme') {
        throw new DOMException('QuotaExceededError');
      }
      return original.call(this, key, value);
    };
    try {
      expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('dark');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('validateStorageValue keybindings', () => {
  it('accepts a valid keybindings store', () => {
    const raw = JSON.stringify({
      mac: { undo: ['mod+z'], copy: ['mod+c'] },
    });
    const safe = validateStorageValue('pixelMockup.keybindings.v1', raw);
    expect(safe).not.toBeNull();
    expect(JSON.parse(safe!)).toEqual({
      mac: { undo: ['mod+z'], copy: ['mod+c'] },
    });
  });

  it('strips unknown actions and bad chords', () => {
    const raw = JSON.stringify({
      mac: {
        undo: ['mod+z', '!!!'],
        evilAction: ['mod+x'],
      },
      hacker: { undo: ['mod+z'] },
    });
    const safe = validateStorageValue('pixelMockup.keybindings.v1', raw);
    expect(safe).not.toBeNull();
    expect(JSON.parse(safe!)).toEqual({
      mac: { undo: ['mod+z'] },
    });
  });

  it('rejects invalid JSON', () => {
    expect(
      validateStorageValue('pixelMockup.keybindings.v1', '{not-json'),
    ).toBeNull();
  });
});
