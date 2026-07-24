import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContextMenu from '../../src/ContextMenu';

const baseProps = {
  state: { x: 12, y: 24, target: 'device' as const },
  platform: 'linux' as const,
  hasSelection: true,
  canPaste: true,
  canBringForward: true,
  canPushBackward: true,
  canBringToFront: true,
  canSendToBack: true,
  onSelectAll: vi.fn(),
  onCopy: vi.fn(),
  onPaste: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onBringForward: vi.fn(),
  onPushBackward: vi.fn(),
  onBringToFront: vi.fn(),
  onSendToBack: vi.fn(),
  onAlign: vi.fn(),
  onClose: vi.fn(),
};

describe('ContextMenu', () => {
  it('renders device menu actions', () => {
    render(<ContextMenu {...baseProps} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete/i })).toBeInTheDocument();
  });

  it('invokes callbacks and closes', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu {...baseProps} onCopy={onCopy} onClose={onClose} />);
    await user.click(screen.getByRole('menuitem', { name: /Copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables actions when selection/capabilities missing', () => {
    render(
      <ContextMenu
        {...baseProps}
        hasSelection={false}
        canPaste={false}
        canBringForward={false}
        canPushBackward={false}
        canBringToFront={false}
        canSendToBack={false}
      />,
    );
    expect(screen.getByRole('menuitem', { name: /Copy/i })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /Paste/i })).toBeDisabled();
  });

  it('shows artboard-oriented items for artboard target', () => {
    render(
      <ContextMenu
        {...baseProps}
        state={{ x: 0, y: 0, target: 'artboard' }}
        hasSelection={false}
      />,
    );
    expect(screen.getByRole('menuitem', { name: /Select all/i })).toBeInTheDocument();
  });

  it('fires align callbacks', async () => {
    const user = userEvent.setup();
    const onAlign = vi.fn();
    render(<ContextMenu {...baseProps} onAlign={onAlign} />);
    await user.click(screen.getByRole('menuitem', { name: /Center/i }));
    expect(onAlign).toHaveBeenCalledWith('center');
  });
});
