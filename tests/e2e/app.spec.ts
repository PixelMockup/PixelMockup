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

async function placeFirstPhone(page: Page) {
  await ensureLibraryOpen(page);
  const search = page.getByRole('searchbox', { name: /Search devices/i });
  await search.fill('iPhone 11 Black');
  const device = page
    .getByRole('complementary', { name: /^Devices$/i })
    .getByRole('button', { name: /iPhone 11 Black/i })
    .first();
  await expect(device).toBeVisible({ timeout: 20_000 });
  await device.click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Pixel Mockup app shell', () => {
  test('loads brand chrome and empty hero CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Pixel Mockup/i);
    await expect(page.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Show on devices/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Show your website on real devices/i),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
  });

  test('opens download options after placing a device', async ({ page }) => {
    await page.goto('/');
    await placeFirstPhone(page);
    const downloadBtn = page.getByRole('button', { name: /^Download$/i }).first();
    await expect(downloadBtn).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('button', { name: /Download options/i }).first().click();
    await expect(page.getByRole('menu').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('opens shortcuts panel', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Shortcuts$/i })
      .click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeVisible();
    await page.getByRole('button', { name: /^Close$/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toHaveCount(0);
  });

  test('toggles theme', async ({ page }) => {
    await page.goto('/');
    const theme = page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /Dark mode|Light mode/i });
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  });

  test('responsive layout at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Show on devices|Start layout only/i }).first(),
    ).toBeVisible();
  });

  test('handles offline interactions without crash', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    await context.setOffline(true);
    await page.keyboard.press('Control+Z');
    await expect(page.locator('#root')).toBeVisible();
    await context.setOffline(false);
  });
});
