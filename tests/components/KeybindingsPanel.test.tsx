import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeybindingsPanel from '../../src/KeybindingsPanel';
import { defaultBindingsFor } from '../../src/keybindings';

describe('KeybindingsPanel', () => {
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
});
