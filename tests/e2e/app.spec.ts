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

async function placeFirstPhone(page: Page) {
  await ensureLibraryOpen(page);
  const search = page.getByRole('searchbox', { name: /Search devices/i });
  await search.fill('iPhone 11 Black');
  const device = page
    .getByRole('complementary', { name: /Device library/i })
    .getByRole('button', { name: /iPhone 11 Black/i })
    .first();
  await expect(device).toBeVisible({ timeout: 20_000 });
  await device.click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('Pixel Mockup app shell', () => {
  test('loads brand chrome and library guidance', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Pixel Mockup/i);
    await expect(page.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
    await ensureLibraryOpen(page);
    await expect(page.getByRole('complementary', { name: /Device library/i })).toBeVisible();
  });

  test('opens and closes export menu after placing a device', async ({ page }) => {
    await page.goto('/');
    await placeFirstPhone(page);
    const exportBtn = page.getByRole('button', { name: /^Export$/i }).first();
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });
    await exportBtn.click();
    await expect(page.getByRole('dialog', { name: 'Export options' }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Export options' })).toHaveCount(0);
  });

  test('opens shortcuts panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: /Shortcuts/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeVisible();
    await page.getByRole('button', { name: /^Close$/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toHaveCount(0);
  });

  test('toggles theme', async ({ page }) => {
    await page.goto('/');
    const theme = page.getByRole('banner').getByRole('button', { name: /mode active/i });
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  });

  test('responsive layout at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
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
