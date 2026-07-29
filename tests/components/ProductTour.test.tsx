import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductTour from '../../src/ProductTour';

const MARGIN = 12;

function getStepText(expected: string): HTMLElement {
  return screen.getByText((content, node) => {
    const hasText = (n: Element | null) => n?.textContent?.includes(expected) ?? false;
    const nodeHasText = hasText(node);
    const childrenDontHaveText = Array.from(node?.children ?? []).every(
      (child) => !hasText(child),
    );
    return nodeHasText && childrenDontHaveText;
  });
}

function setElementRect(
  el: Element,
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number },
) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => rect,
    configurable: true,
  });
}

describe('ProductTour', () => {
  beforeEach(() => {
    const stage = document.createElement('div');
    stage.className = 'ms-stage';
    document.body.appendChild(stage);
  });

  afterEach(() => {
    document.querySelector('.ms-stage')?.remove();
    document.querySelector('.ms-rail-devices')?.remove();
    document.querySelector('.ms-mobile-dock__btn[aria-label="Devices"]')?.remove();
  });

  it('renders the first step when open', () => {
    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Pixel Mockup')).toBeInTheDocument();
    expect(getStepText('Step 1 of 5')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <ProductTour open={false} onClose={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('advances to the next step', () => {
    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Add a device')).toBeInTheDocument();
    expect(getStepText('Step 2 of 5')).toBeInTheDocument();
  });

  it('goes back to the previous step', () => {
    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText('Welcome to Pixel Mockup')).toBeInTheDocument();
  });

  it('completes the tour on Finish', () => {
    const onComplete = vi.fn();
    render(<ProductTour open onClose={onComplete} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Save your mockup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Finish/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('completes the tour on Skip', () => {
    const onComplete = vi.fn();
    render(<ProductTour open onClose={onComplete} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip tour/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('closes the tour on Escape', () => {
    const onComplete = vi.fn();
    render(<ProductTour open onClose={onComplete} onComplete={onComplete} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the tooltip card within the viewport when the target is near the top edge', () => {
    const stage = document.querySelector('.ms-stage')!;
    setElementRect(stage, {
      top: 0,
      left: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 600,
      configurable: true,
    });

    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);

    const card = screen.getByRole('document');
    const cardRect = card.getBoundingClientRect();
    expect(cardRect.left).toBeGreaterThanOrEqual(0);
    expect(cardRect.top).toBeGreaterThanOrEqual(0);
    expect(cardRect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(cardRect.bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it('clamps the tooltip card to the available viewport height', () => {
    const stage = document.querySelector('.ms-stage')!;
    setElementRect(stage, {
      top: 0,
      left: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 180,
      configurable: true,
    });

    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);

    const card = screen.getByRole('document');
    const cardRect = card.getBoundingClientRect();
    expect(cardRect.height).toBeLessThanOrEqual(window.innerHeight - MARGIN * 2);
    const content = card.querySelector('.ms-tour__content');
    expect(content).toHaveStyle({ overflowY: 'auto' });
  });

  it('keeps the devices step tooltip within the viewport on a small viewport', () => {
    const rail = document.createElement('button');
    rail.className = 'ms-rail-devices';
    document.body.appendChild(rail);
    setElementRect(rail, {
      top: 48,
      left: 0,
      right: 48,
      bottom: 96,
      width: 48,
      height: 48,
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 768,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 600,
      configurable: true,
    });

    render(<ProductTour open onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Add a device')).toBeInTheDocument();

    const card = screen.getByRole('document');
    const cardRect = card.getBoundingClientRect();
    expect(cardRect.left).toBeGreaterThanOrEqual(0);
    expect(cardRect.top).toBeGreaterThanOrEqual(0);
    expect(cardRect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(cardRect.bottom).toBeLessThanOrEqual(window.innerHeight);
  });
});
