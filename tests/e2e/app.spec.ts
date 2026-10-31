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
  // Boot priority load can show an overlay that steals hit-testing.
  await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  await ensureLibraryOpen(page);
  const search = page.getByRole('searchbox', { name: /Search devices/i });
  await search.fill('iPhone 11 Black');
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

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

  test('opens export settings after placing a device', async ({ page }) => {
    await page.goto('/');
    await placeFirstPhone(page);
    const rail = page.getByRole('navigation', { name: /Studio tools/i });
    await rail.getByRole('button', { name: /^Canvas Settings$/i }).click();
    const menu = page.getByRole('menu', { name: /Canvas Settings/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Format')).toBeVisible();
    await expect(menu.getByText('Resolution')).toBeVisible();
    await expect(menu.getByText('Transparent background')).toBeVisible();
  });

  test('opens shortcuts panel', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Settings$/i })
      .click();
    await page.getByRole('menuitem', { name: /^Keyboard shortcuts$/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeVisible();
    await page.getByRole('button', { name: /^X$/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toHaveCount(0);
  });

  test('closes shortcuts panel with Escape', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Settings$/i })
      .click();
    await page.getByRole('menuitem', { name: /^Keyboard shortcuts$/i }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts/i })).toHaveCount(0);
  });

  test('shortcuts panel close button is inside viewport', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Settings$/i })
      .click();
    await page.getByRole('menuitem', { name: /^Keyboard shortcuts$/i }).click();
    const closeBtn = page.getByRole('button', { name: /^X$/i });
    await expect(closeBtn).toBeVisible();
    const box = await closeBtn.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  });

  test('toggles theme', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Settings$/i })
      .click();
    await page.getByRole('menuitem', { name: /Dark mode|Light mode/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
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

test.describe('First-time tour', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('pixelMockup.tourSeen');
    });
  });

  test('starts automatically on first visit', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: /Product tour/i });
    await expect(tour).toBeVisible();
    await expect(tour.getByRole('heading', { name: /Welcome to Pixel Mockup/i })).toBeVisible();
  });

  test('navigates through all steps and finishes', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: /Product tour/i });
    await expect(tour).toBeVisible();
    await expect(tour.getByRole('heading', { name: /Welcome to Pixel Mockup/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Add a device/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Add a layout/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Canvas Settings/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Settings/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Show a website/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Arrange your scene/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Remaining balance/i })).toBeVisible();

    await tour.getByRole('button', { name: /Next/i }).click();
    await expect(tour.getByRole('heading', { name: /Save your mockup/i })).toBeVisible();

    await tour.getByRole('button', { name: /Finish/i }).click();
    await expect(tour).toHaveCount(0);
  });

  test('can skip the tour', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: /Product tour/i });
    await expect(tour).toBeVisible();
    await tour.getByRole('button', { name: /Skip tour/i }).click();
    await expect(tour).toHaveCount(0);
  });

  test('can be restarted from the Settings menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('dialog', { name: /Product tour/i })
      .getByRole('button', { name: /Skip tour/i })
      .click();

    await page.getByRole('navigation', { name: /Studio tools/i })
      .getByRole('button', { name: /^Settings$/i })
      .click();
    await page.getByRole('menuitem', { name: /Take tour/i }).click();

    await expect(
      page.getByRole('dialog', { name: /Product tour/i }),
    ).toBeVisible();
  });

});
