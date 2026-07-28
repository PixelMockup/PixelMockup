import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeybindingsPanel from '../../src/KeybindingsPanel';
import { defaultBindingsFor } from '../../src/keybindings';

describe('KeybindingsPanel', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });
  it('renders nothing when closed', () => {
    const { container } = render(
      <KeybindingsPanel
        open={false}
        onClose={vi.fn()}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={vi.fn()}
        platform="linux"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders actions when open', () => {
    render(
      <KeybindingsPanel
        open
        onClose={vi.fn()}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={vi.fn()}
        platform="linux"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Keyboard shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText(/Undo/i)).toBeInTheDocument();
  });

  it('calls onClose from close control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <KeybindingsPanel
        open
        onClose={onClose}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={vi.fn()}
        platform="linux"
      />,
    );
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('resets bindings', async () => {
    const user = userEvent.setup();
    const onBindingsChange = vi.fn();
    render(
      <KeybindingsPanel
        open
        onClose={vi.fn()}
        bindings={{
          ...defaultBindingsFor('linux'),
          undo: ['alt+z'],
        }}
        onBindingsChange={onBindingsChange}
        platform="linux"
      />,
    );
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(onBindingsChange).toHaveBeenCalled();
    const next = onBindingsChange.mock.calls[0][0];
    expect(next.undo).toEqual(['mod+z']);
  });

  it('renders a Close button with exact accessible name', () => {
    render(
      <KeybindingsPanel
        open
        onClose={vi.fn()}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={vi.fn()}
        platform="linux"
      />,
    );
    expect(
      screen.getByRole('button', { name: /^Close$/i }),
    ).toBeInTheDocument();
  });

  it('clears a binding', async () => {
    const user = userEvent.setup();
    const onBindingsChange = vi.fn();
    render(
      <KeybindingsPanel
        open
        onClose={vi.fn()}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={onBindingsChange}
        platform="linux"
      />,
    );
    const rows = screen.getAllByRole('row');
    const undoRow = rows.find((row) => row.textContent?.includes('Undo'));
    expect(undoRow).toBeDefined();
    const clearBtn = within(undoRow!).getByRole('button', { name: /clear/i });
    await user.click(clearBtn);
    expect(onBindingsChange).toHaveBeenCalled();
    const next = onBindingsChange.mock.calls[0][0];
    expect(next.undo).toEqual([]);
  });
});
