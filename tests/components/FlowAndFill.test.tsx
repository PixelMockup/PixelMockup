import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlowStepStrip, { flowStepFromState } from '../../src/FlowStepStrip';
import FillScreensPanel from '../../src/FillScreensPanel';
import { vi } from 'vitest';

describe('flowStepFromState', () => {
  it('maps empty canvas to step 1', () => {
    expect(flowStepFromState(0, false)).toBe(1);
  });

  it('maps devices without screens to step 2', () => {
    expect(flowStepFromState(3, false)).toBe(2);
  });

  it('maps filled screens to step 3', () => {
    expect(flowStepFromState(2, true)).toBe(3);
  });
});

describe('FlowStepStrip', () => {
  it('marks the current step', () => {
    render(<FlowStepStrip step={2} screensFilled={false} />);
    expect(screen.getByText('Fill screens').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});

describe('FillScreensPanel', () => {
  it('applies a normalized URL', async () => {
    const user = userEvent.setup();
    const onApplyUrl = vi.fn();
    render(
      <FillScreensPanel
        websiteUrl={null}
        onApplyUrl={onApplyUrl}
        onClearUrl={vi.fn()}
        onUploadImage={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Website'), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyUrl).toHaveBeenCalledWith('https://example.com/');
  });

  it('exposes upload photo', async () => {
    const user = userEvent.setup();
    const onUploadImage = vi.fn();
    render(
      <FillScreensPanel
        websiteUrl={null}
        onApplyUrl={vi.fn()}
        onClearUrl={vi.fn()}
        onUploadImage={onUploadImage}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Upload photo' }));
    expect(onUploadImage).toHaveBeenCalled();
  });
});
