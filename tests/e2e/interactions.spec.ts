import { test, expect, type Page } from '@playwright/test';

async function ensureLibraryOpen(page: Page) {
  const library = page.getByRole('complementary', { name: /^Devices$/i });
  if (await library.isVisible().catch(() => false)) {
    return;
  }
  const rail = page.getByRole('navigation', { name: /Studio tools/i });
  const devices = rail.getByRole('button', { name: /Devices|Hide devices/i });
  if (await devices.count()) {
    await devices.click();
    await expect(library).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: /^Browse devices$/i }).click();
  await expect(library).toBeVisible();
}

async function placeIphone(page: Page) {
  await ensureLibraryOpen(page);
  await page.getByRole('searchbox', { name: /Search devices/i }).fill('iPhone 11 Black');
  await page
    .getByRole('complementary', { name: /^Devices$/i })
    .getByRole('button', { name: /iPhone 11 Black/i })
    .first()
    .click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('library and canvas interactions', () => {
  test('can search devices and place via click', async ({ page }) => {
    await page.goto('/');
    await placeIphone(page);
    await expect(page.locator('.ms-artboard')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
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

  test('upload photo appears when a device is selected', async ({ page }) => {
    await page.goto('/');
    await placeIphone(page);
    await page.locator('.ms-canvas-item').first().click();
    const upload = page
      .getByRole('complementary', { name: /Selection/i })
      .getByRole('button', { name: /Upload photo/i });
    await expect(upload).toBeVisible();
    await expect(upload).toBeEnabled();
  });

  test('selection and delete shortcut path stays stable', async ({ page }) => {
    await page.goto('/');
    await placeIphone(page);
    await page.locator('.ms-canvas-item').first().click();
    await page.keyboard.press('Delete');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('empty hero starts layout only in one click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start layout only/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
  });
});
