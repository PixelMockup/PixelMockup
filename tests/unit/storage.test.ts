import { describe, expect, it, beforeEach } from 'vitest';
import { storageGet, storageSet } from '../../src/storage';

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

  it('falls back to legacy and migrates', () => {
    localStorage.setItem('mockupStudio.theme', 'light');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('light');
    expect(localStorage.getItem('pixelMockup.theme')).toBe('light');
  });

  it('prefers new key over legacy', () => {
    localStorage.setItem('pixelMockup.theme', 'dark');
    localStorage.setItem('mockupStudio.theme', 'light');
    expect(storageGet('pixelMockup.theme', 'mockupStudio.theme')).toBe('dark');
  });

  it('stores empty string values', () => {
    storageSet('pixelMockup.x', '');
    expect(localStorage.getItem('pixelMockup.x')).toBe('');
    expect(storageGet('pixelMockup.x', 'legacy.x')).toBe('');
  });

  it('stores unicode and emoji', () => {
    storageSet('pixelMockup.x', 'こんにちは🎨');
    expect(storageGet('pixelMockup.x', 'legacy.x')).toBe('こんにちは🎨');
  });

  it('stores very long values', () => {
    const long = 'a'.repeat(50_000);
    storageSet('pixelMockup.x', long);
    expect(storageGet('pixelMockup.x', 'legacy.x')).toBe(long);
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
