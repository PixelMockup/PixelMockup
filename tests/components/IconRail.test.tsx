import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import IconRail from '../../src/IconRail';

const defaultProps = {
  devicesOpen: false,
  onToggleDevices: vi.fn(),
  layoutsOpen: false,
  onLayoutsOpenChange: vi.fn(),
  moreOpen: false,
  onMoreOpenChange: vi.fn(),
  placing: false,
  onApplyPreset: vi.fn(),
  artboardFormatId: '16-9' as const,
  onArtboardFormat: vi.fn(),
  sizeScaleId: '1x' as const,
  onSizeScale: vi.fn(),
  snapEnabled: false,
  onSnapEnabled: vi.fn(),
  onAlignH: vi.fn(),
  onAlignV: vi.fn(),
  onBringForward: vi.fn(),
  onSendBackward: vi.fn(),
  canReorder: false,
  theme: 'light' as const,
  onToggleTheme: vi.fn(),
  websitePreviewMode: 'screenshot' as const,
  onToggleWebsitePreviewMode: vi.fn(),
  onOpenShortcuts: vi.fn(),
  onTakeTour: vi.fn(),
  layoutsRef: createRef<HTMLDivElement>(),
  moreRef: createRef<HTMLDivElement>(),
};

describe('IconRail', () => {
  it('renders the settings gear button', () => {
    render(<IconRail {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^Settings$/i })).toBeInTheDocument();
  });

  it('opens the settings menu with theme, preview mode, shortcuts, and tour items', () => {
    render(<IconRail {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    expect(screen.getByRole('menuitem', { name: /Dark mode/i })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Live iframe preview/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Take tour/i })).toBeInTheDocument();
  });

  it('toggles theme from the settings menu', () => {
    const onToggleTheme = vi.fn();
    render(<IconRail {...defaultProps} onToggleTheme={onToggleTheme} />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Dark mode/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('toggles website preview mode from the settings menu', () => {
    const onToggleWebsitePreviewMode = vi.fn();
    render(
      <IconRail
        {...defaultProps}
        onToggleWebsitePreviewMode={onToggleWebsitePreviewMode}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Live iframe preview/i }));
    expect(onToggleWebsitePreviewMode).toHaveBeenCalledTimes(1);
  });

  it('opens shortcuts from the settings menu', () => {
    const onOpenShortcuts = vi.fn();
    render(<IconRail {...defaultProps} onOpenShortcuts={onOpenShortcuts} />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Keyboard shortcuts/i }));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('restarts the tour from the settings menu', () => {
    const onTakeTour = vi.fn();
    render(<IconRail {...defaultProps} onTakeTour={onTakeTour} />);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Take tour/i }));
    expect(onTakeTour).toHaveBeenCalledTimes(1);
  });
});
