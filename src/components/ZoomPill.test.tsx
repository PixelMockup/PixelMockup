import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoomPill from '../ZoomPill';

describe('ZoomPill', () => {
  it('renders 100%', () => {
    render(<ZoomPill viewZoom={1} liveScale={1} onViewZoom={() => {}} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('+ steps up', () => {
    const fn = vi.fn();
    render(<ZoomPill viewZoom={1} liveScale={1} onViewZoom={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(fn).toHaveBeenCalled();
  });

  it('− steps down', () => {
    const fn = vi.fn();
    render(<ZoomPill viewZoom={1} liveScale={1} onViewZoom={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(fn).toHaveBeenCalled();
  });

  it('Fit click calls onViewZoom("fit") and has aria-pressed', () => {
    const fn = vi.fn();
    render(<ZoomPill viewZoom="fit" liveScale={1} onViewZoom={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /fit/i }));
    expect(fn).toHaveBeenCalledWith('fit');
    expect(screen.getByRole('button', { name: /fit/i }).getAttribute('aria-pressed')).toBe('true');
  });
});
