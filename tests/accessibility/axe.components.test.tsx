import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import ContextMenu from '../../src/ContextMenu';
import KeybindingsPanel from '../../src/KeybindingsPanel';
import { defaultBindingsFor } from '../../src/keybindings';
import { vi } from 'vitest';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

async function expectNoSeriousViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa'],
    },
  });
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

describe('accessibility', () => {
  it('ContextMenu has no serious axe violations', async () => {
    const { container } = render(
      <ContextMenu
        state={{ x: 8, y: 8, target: 'device' }}
        platform="linux"
        hasSelection
        hasScreenImage={false}
        canPaste
        canBringForward
        canPushBackward
        canBringToFront
        canSendToBack
        onSelectAll={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onBringForward={vi.fn()}
        onPushBackward={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
        onAlign={vi.fn()}
        onAddScreenImage={vi.fn()}
        onRemoveScreenImage={vi.fn()}
        onResetScreenFraming={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await expectNoSeriousViolations(container);
  });

  it('KeybindingsPanel has no serious axe violations', async () => {
    const { container } = render(
      <KeybindingsPanel
        open
        onClose={vi.fn()}
        bindings={defaultBindingsFor('linux')}
        onBindingsChange={vi.fn()}
        platform="linux"
      />,
    );
    await expectNoSeriousViolations(container);
  });
});
