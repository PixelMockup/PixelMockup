import { describe, expect, it } from 'vitest';
import { initTheme, useTheme } from '../../src/useTheme';
import { renderHook, act } from '@testing-library/react';

describe('useTheme', () => {
  it('initTheme defaults to light and reads storage', () => {
    localStorage.clear();
    expect(initTheme()).toBe('light');
    localStorage.setItem('pixelMockup.theme', 'dark');
    expect(initTheme()).toBe('dark');
    localStorage.setItem('pixelMockup.theme', 'nope');
    expect(initTheme()).toBe('light');
  });

  it('toggles theme and persists', () => {
    localStorage.clear();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('pixelMockup.theme')).toBe('dark');
  });
});
