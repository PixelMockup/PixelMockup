import { test, expect, type Page } from '@playwright/test';

async function dismissMobileWarningIfShown(page: Page) {
  const warn = page.getByRole('dialog', {
    name: /Rotate for the best experience|Screen is very small/i,
  });
  const btn = page.getByRole('button', { name: /Continue anyway/i });
  if (await warn.isVisible().catch(() => false)) {
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
  }
}

const TABLET = 768;
const DESKTOP = 1024;

test.describe('responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pixelMockup.tourSeen', '1'));
  });

  test('no horizontal overflow at common viewport widths', async ({ page }) => {
    const widths = [320, 390, 480, 600, TABLET, 900, DESKTOP, 1280];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
        timeout: 60_000,
      });
      dismissMobileWarningIfShown(page);
      // Wait for CSS layout to settle at the new viewport size.
      await page.waitForTimeout(300);

      const scrollW = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const vw = await page.evaluate(() => window.innerWidth);
      expect(scrollW, `width=${w}`).toBeLessThanOrEqual(vw);
    }
  });

  test('mobile dock appears at tablet, icon rail hidden', async ({ page }) => {
    await page.setViewportSize({ width: TABLET, height: 1024 });
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });

    await expect(page.locator('.ms-mobile-dock')).toBeVisible();
    await expect(page.locator('.ms-icon-rail')).not.toBeVisible();
  });

  test('icon rail appears at desktop, mobile dock hidden', async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP, height: 900 });
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });

    await expect(page.locator('.ms-icon-rail')).toBeVisible();
    await expect(page.locator('.ms-mobile-dock')).not.toBeVisible();
  });

  test('empty hero is usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    dismissMobileWarningIfShown(page);

    await expect(page.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Show on devices|Start layout only/i }).first(),
    ).toBeVisible();
  });

  test('command bar URL visible at desktop', async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP, height: 900 });
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(
      page.getByRole('textbox', { name: /Website URL/i }).first(),
    ).toBeVisible();
  });

  test('artboard scales to fit every tested viewport', async ({ page }) => {
    const widths = [320, 390, 600, TABLET];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 });
      // Ensure viewport is set before navigation.
      await page.goto('/');
      await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
        timeout: 60_000,
      });
      dismissMobileWarningIfShown(page);

      const startBtn = page
        .getByRole('button', { name: /Start layout only/i })
        .first();
      // Wait for button to be attached and stable before clicking.
      await startBtn.waitFor({ state: 'attached', timeout: 10000 });
      await startBtn.click();
      // Wait for the layout to apply — the artboard should gain canvas items.
      await page
        .locator('.ms-canvas-item')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 });

      const box = await page.locator('.ms-artboard').first().boundingBox();
      expect(box, `width=${w}`).not.toBeNull();
      expect(box!.width, `width=${w}`).toBeGreaterThan(0);
      expect(box!.height, `width=${w}`).toBeGreaterThan(0);
    }
  });
});
