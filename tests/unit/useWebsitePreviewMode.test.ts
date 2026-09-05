import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebsitePreviewMode } from '../../src/useWebsitePreviewMode';

describe('useWebsitePreviewMode', () => {
  it('defaults to screenshot', () => {
    localStorage.clear();
    const { result } = renderHook(() => useWebsitePreviewMode());
    expect(result.current.websitePreviewMode).toBe('screenshot');
  });

  it('ignores invalid stored values', () => {
    localStorage.clear();
    localStorage.setItem('pixelMockup.websitePreviewMode', 'embed');
    const { result } = renderHook(() => useWebsitePreviewMode());
    expect(result.current.websitePreviewMode).toBe('screenshot');
  });
});
