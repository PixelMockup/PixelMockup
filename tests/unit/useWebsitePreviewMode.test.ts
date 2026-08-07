import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebsitePreviewMode } from '../../src/useWebsitePreviewMode';

describe('useWebsitePreviewMode', () => {
  it('defaults to screenshot and persists toggle', () => {
    localStorage.clear();
    const { result } = renderHook(() => useWebsitePreviewMode());
    expect(result.current.websitePreviewMode).toBe('screenshot');
    act(() => {
      result.current.toggleWebsitePreviewMode();
    });
    expect(result.current.websitePreviewMode).toBe('iframe');
    expect(localStorage.getItem('pixelMockup.websitePreviewMode')).toBe('iframe');
    act(() => {
      result.current.setWebsitePreviewMode('screenshot');
    });
    expect(result.current.websitePreviewMode).toBe('screenshot');
  });

  it('reads stored iframe mode', () => {
    localStorage.clear();
    localStorage.setItem('pixelMockup.websitePreviewMode', 'iframe');
    const { result } = renderHook(() => useWebsitePreviewMode());
    expect(result.current.websitePreviewMode).toBe('iframe');
  });

  it('ignores invalid stored values', () => {
    localStorage.clear();
    localStorage.setItem('pixelMockup.websitePreviewMode', 'embed');
    const { result } = renderHook(() => useWebsitePreviewMode());
    expect(result.current.websitePreviewMode).toBe('screenshot');
  });
});
