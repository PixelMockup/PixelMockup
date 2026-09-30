import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

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
  // Boot priority load can show an overlay that steals hit-testing.
  await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  await ensureLibraryOpen(page);
  await page.getByRole('searchbox', { name: /Search devices/i }).fill('iPhone 11 Black');
  const device = page
    .getByRole('complementary', { name: /^Devices$/i })
    .getByRole('button', { name: /iPhone 11 Black/i })
    .first();
  await expect(device).toBeVisible({ timeout: 20_000 });

  // Unloaded tiles load on first click and place on the second.
  if (await device.evaluate((el) => el.classList.contains('ms-device-tile--unloaded'))) {
    await device.click();
    await expect(device).not.toHaveClass(/ms-device-tile--unloaded/, {
      timeout: 30_000,
    });
  }
  await ensureLibraryOpen(page);
  await device.click();
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

  test('empty hero starts show on devices in one click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /Website URL/i }).fill('google.com');
    await page.getByRole('button', { name: /Show on devices/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
  });
});
