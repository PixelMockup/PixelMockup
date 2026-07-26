import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyHero from '../../src/EmptyHero';

describe('EmptyHero', () => {
  it('requires a URL before Show on devices', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(
      <EmptyHero
        onShowOnDevices={onShow}
        onStartLayoutOnly={vi.fn()}
        onBrowseDevices={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Show on devices/i })).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: /Website URL/i }),
      'https://example.com',
    );
    await user.click(screen.getByRole('button', { name: /Show on devices/i }));
    expect(onShow).toHaveBeenCalledWith('https://example.com/');
  });

  it('exposes quiet layout and browse actions', async () => {
    const user = userEvent.setup();
    const onLayout = vi.fn();
    const onBrowse = vi.fn();
    render(
      <EmptyHero
        onShowOnDevices={vi.fn()}
        onStartLayoutOnly={onLayout}
        onBrowseDevices={onBrowse}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Start layout only/i }));
    await user.click(screen.getByRole('button', { name: /Browse devices/i }));
    expect(onLayout).toHaveBeenCalled();
    expect(onBrowse).toHaveBeenCalled();
  });
});
