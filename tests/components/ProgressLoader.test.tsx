import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ProgressLoader from '../../src/ProgressLoader';

describe('ProgressLoader', () => {
  it('renders the first message and progress', () => {
    render(
      <ProgressLoader
        progress={40}
        messages={[
          'Loading device catalog...',
          'Preparing mock phones...',
          'Arranging workspace...',
          'Almost ready...',
        ]}
      />,
    );
    expect(
      document.querySelector('.ms-progress-loader__message')?.textContent,
    ).toBe('Loading device catalog...');
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('scrolls to the next message by the correct percentage', () => {
    vi.useFakeTimers();
    render(
      <ProgressLoader
        progress={40}
        messages={[
          'Loading device catalog...',
          'Preparing mock phones...',
          'Arranging workspace...',
          'Almost ready...',
        ]}
      />,
    );
    const strip = document.querySelector('.ms-progress-loader__text-strip') as HTMLElement;
    expect(strip.style.transform).toBe('translateY(-0%)');
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(strip.style.transform).toBe('translateY(-25%)');
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(strip.style.transform).toBe('translateY(-50%)');
    vi.useRealTimers();
  });
});
