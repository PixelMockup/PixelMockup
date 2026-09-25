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
});
