import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppDialog from '../../src/AppDialog';

describe('AppDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders title, body, and actions without using window.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AppDialog
        open
        title="Replace artboard?"
        body="Replace with Apple lineup?"
        onClose={onClose}
        actions={[
          { label: 'Cancel', variant: 'ghost', onClick: onClose },
          { label: 'Replace', variant: 'primary', onClick: onConfirm },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Replace artboard?' })).toBeInTheDocument();
    expect(screen.getByText('Replace with Apple lineup?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
