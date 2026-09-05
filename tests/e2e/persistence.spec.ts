import { test, expect, type Page } from '@playwright/test';

async function openCanvasTools(page: Page) {
  const moreBtn = page.locator('[aria-label="Canvas tools"]');
  if (!(await moreBtn.isVisible())) {
    const rail = page.locator('.ms-icon-rail');
    if (await rail.isVisible()) {
      await moreBtn.click();
    }
  } else {
    await moreBtn.click();
  }
  const menu = page.locator('.ms-rail-menu--wide');
  await expect(menu).toBeVisible();
  return menu;
}

test.describe('settings persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pixelMockup.tourSeen', '1'));
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
  });

  test('theme preference survives a page reload', async ({ page }) => {
    const rail = page.locator('.ms-icon-rail');
    await expect(rail).toBeVisible();

    const settingsBtn = rail.getByRole('button', { name: /^Settings$/i });
    await settingsBtn.click();
    const darkModeBtn = page.getByRole('menuitem', { name: /Dark mode|Light mode/i });
    await darkModeBtn.click();

    const themeAfterChange = await page.locator('html').getAttribute('data-theme');
    expect(themeAfterChange).toMatch(/dark|light/);

    await page.reload();
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', themeAfterChange!);
  });

  test('snap enabled preference survives a page reload', async ({ page }) => {
    const rail = page.locator('.ms-icon-rail');
    await expect(rail).toBeVisible();

    // Snap toggle is in the Canvas tools menu (More button).
    const moreBtn = rail.locator('[aria-label="Canvas tools"]');
    await moreBtn.click();
    const menu = page.locator('.ms-rail-menu--wide');
    await expect(menu).toBeVisible();

    const snapLabel = menu.locator('.ms-check', { hasText: 'Snap to edges' });
    const snapCheckbox = snapLabel.locator('input[type="checkbox"]');
    const wasChecked = await snapCheckbox.isChecked();

    // Toggle snap off.
    await snapCheckbox.setChecked(!wasChecked);
    const afterToggle = await snapCheckbox.isChecked();
    expect(afterToggle).toBe(!wasChecked);

    // Reload and verify snap state persisted.
    await page.reload();
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });

    // Open Canvas tools menu again.
    await rail.locator('[aria-label="Canvas tools"]').click();
    await expect(menu).toBeVisible();
    const persistedSnap = await snapCheckbox.isChecked();
    expect(persistedSnap).toBe(afterToggle);
  });

  test('artboard format preference survives a page reload', async ({ page }) => {
    const rail = page.locator('.ms-icon-rail');
    await expect(rail).toBeVisible();

    // Canvas size is in the Canvas tools menu.
    const moreBtn = rail.locator('[aria-label="Canvas tools"]');
    await moreBtn.click();
    const menu = page.locator('.ms-rail-menu--wide');
    await expect(menu).toBeVisible();

    const canvasSelect = menu.locator('select').first();
    const initialValue = await canvasSelect.inputValue();

    // Pick a different format if available.
    const options = await canvasSelect.locator('option').all();
    if (options.length > 1) {
      const otherOption = await canvasSelect.locator('option').nth(1);
      const newValue = await otherOption.getAttribute('value');
      await canvasSelect.selectOption(newValue!);
      const afterChange = await canvasSelect.inputValue();
      expect(afterChange).toBe(newValue);

      // Reload and verify.
      await page.reload();
      await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
        timeout: 60_000,
      });

      await rail.locator('[aria-label="Canvas tools"]').click();
      await expect(menu).toBeVisible();
      const persisted = await canvasSelect.inputValue();
      expect(persisted).toBe(afterChange);
    }
  });
});
