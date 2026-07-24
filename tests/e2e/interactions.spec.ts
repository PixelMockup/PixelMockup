import { test, expect, type Page } from '@playwright/test';

async function ensureLibraryOpen(page: Page) {
  const toggle = page.getByRole('banner').getByRole('button', {
    name: /device library/i,
  });
  if (await toggle.count()) {
    const label = await toggle.getAttribute('aria-label');
    if (label?.toLowerCase().includes('show')) {
      await toggle.click();
    }
  }
}

test.describe('library and canvas interactions', () => {
  test('can search library and place a device via click', async ({ page }) => {
    await page.goto('/');
    await ensureLibraryOpen(page);
    await page.getByRole('searchbox', { name: /Search devices/i }).fill('iPhone 11 Black');
    const device = page
      .getByRole('complementary', { name: /Device library/i })
      .getByRole('button', { name: /iPhone 11 Black/i })
      .first();
    await expect(device).toBeVisible({ timeout: 20_000 });
    await device.click();
    await expect(page.locator('.ms-artboard')).toBeVisible();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('zoom controls respond', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.locator('#root')).toBeVisible();
  });

  test('keyboard undo chord does not crash', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+Z');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('selection and delete shortcut path stays stable', async ({ page }) => {
    await page.goto('/');
    await ensureLibraryOpen(page);
    await page.getByRole('searchbox', { name: /Search devices/i }).fill('iPhone 11 Black');
    await page
      .getByRole('complementary', { name: /Device library/i })
      .getByRole('button', { name: /iPhone 11 Black/i })
      .first()
      .click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator('.ms-canvas-item').first().click();
    await page.keyboard.press('Delete');
    await expect(page.locator('#root')).toBeVisible();
  });
});
