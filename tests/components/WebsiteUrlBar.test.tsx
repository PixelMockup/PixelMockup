import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WebsiteUrlBar from '../../src/WebsiteUrlBar';
import { coverScaleForViewport } from '../../src/websiteUrl';
import { mapScreenRectToDisplay } from '../../src/deviceScreens';
import { getClippedScreenPlacement } from '../../src/exportMockup';

describe('WebsiteUrlBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid URLs and does not call onApply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();
    render(
      <WebsiteUrlBar websiteUrl={null} onApply={onApply} onClear={onClear} />,
    );

    const input = screen.getByLabelText('Website');
    await user.type(input, 'javascript:alert(1)');
    await user.keyboard('{Enter}');

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid http(s) URL',
    );
  });

  it('applies a normalized https URL', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <WebsiteUrlBar websiteUrl={null} onApply={onApply} onClear={vi.fn()} />,
    );

    await user.type(screen.getByLabelText('Website'), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith('https://example.com/');
  });

  it('shows active hostname and clears', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <WebsiteUrlBar
        websiteUrl="https://www.example.com/path"
        onApply={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(screen.getByText(/On devices: www.example.com/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('website clip fill for export-like placement', () => {
  it('cover-scaled viewport fills mapped screen destination', () => {
    const content = { x: 0, y: 0, width: 1000, height: 2000 };
    const screen = { x: 80, y: 120, width: 840, height: 1760, rx: 40 };
    const mapped = mapScreenRectToDisplay(screen, content, 0, 0, 250, 500);
    const viewport = { width: 390, height: 844 };
    const scale = coverScaleForViewport(
      viewport.width,
      viewport.height,
      mapped.width,
      mapped.height,
    );
    expect(viewport.width * scale).toBeGreaterThanOrEqual(mapped.width - 1e-6);
    expect(viewport.height * scale).toBeGreaterThanOrEqual(mapped.height - 1e-6);

    const placement = getClippedScreenPlacement(
      viewport.width,
      viewport.height,
      mapped.x,
      mapped.y,
      mapped.width,
      mapped.height,
    );
    expect(placement.destination.width).toBeCloseTo(mapped.width, 6);
    expect(placement.destination.height).toBeCloseTo(mapped.height, 6);
    expect(placement.crop.width / placement.crop.height).toBeCloseTo(
      mapped.width / mapped.height,
      5,
    );
  });
});
