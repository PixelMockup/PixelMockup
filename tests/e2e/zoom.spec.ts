import { test, expect, type Page, type Locator } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

function zoomOut(page: Page) {
  return page.getByRole('button', { name: /^Zoom out$/i }).first();
}

function zoomIn(page: Page) {
  return page.getByRole('button', { name: /^Zoom in$/i }).first();
}

function zoomLabel(page: Page) {
  return page.locator('.ms-view-zoom-label').first();
}

async function artboardSize(page: Page) {
  const box = await page.locator('.ms-artboard').first().boundingBox();
  expect(box).not.toBeNull();
  return { width: box!.width, height: box!.height };
}

async function placePhone(page: Page) {
  await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^Start layout only$/i }).first().click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 45_000,
  });
}

test.describe('zoom controls', () => {
  test('exposes all four zoom steps', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });

    // Default label is Fit.
    await expect(zoomLabel(page)).toHaveText('Fit');

    // Zoom in: Fit -> 50% -> 100% -> 150%
    await zoomIn(page).click();
    await expect(zoomLabel(page)).toHaveText('50%');

    await zoomIn(page).click();
    await expect(zoomLabel(page)).toHaveText('100%');

    await zoomIn(page).click();
    await expect(zoomLabel(page)).toHaveText('150%');

    // Zoom in at max stays clamped at 150%.
    await zoomIn(page).click();
    await expect(zoomLabel(page)).toHaveText('150%');

    // Zoom out back down to Fit.
    await zoomOut(page).click();
    await expect(zoomLabel(page)).toHaveText('100%');
    await zoomOut(page).click();
    await expect(zoomLabel(page)).toHaveText('50%');
    await zoomOut(page).click();
    await expect(zoomLabel(page)).toHaveText('Fit');

    // Zoom out at min stays clamped at Fit.
    await zoomOut(page).click();
    await expect(zoomLabel(page)).toHaveText('Fit');
  });

  test('explicit zoom steps scale the artboard to true pixel sizes', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await placePhone(page);

    await zoomIn(page).click(); // 50%
    await expect(zoomLabel(page)).toHaveText('50%');
    const at50 = await artboardSize(page);

    await zoomIn(page).click(); // 100%
    await expect(zoomLabel(page)).toHaveText('100%');
    const at100 = await artboardSize(page);

    await zoomIn(page).click(); // 150%
    await expect(zoomLabel(page)).toHaveText('150%');
    const at150 = await artboardSize(page);

    // Each explicit step must be clearly larger than the previous one,
    // otherwise 50%/100% are indistinguishable from each other or from Fit.
    expect(at100.width).toBeGreaterThan(at50.width);
    expect(at150.width).toBeGreaterThan(at100.width);
    expect(at150.height).toBeGreaterThan(at100.height);
  });

  test('Fit is available as a button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await placePhone(page);

    const fitBtn = page
      .getByRole('button', { name: /Fit artboard to stage/i })
      .first();
    await fitBtn.click();
    await expect(zoomLabel(page)).toHaveText('Fit');
  });

  test('stage becomes scrollable when zoomed in beyond the viewport', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await placePhone(page);

    // Zoom to 150% which should exceed the viewport.
    await zoomIn(page).click();
    await zoomIn(page).click();
    await zoomIn(page).click();
    await expect(zoomLabel(page)).toHaveText('150%');

    const canvas = page.locator('.ms-stage__canvas');
    const dimensions = await canvas.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowX: getComputedStyle(el).overflowX,
      overflowY: getComputedStyle(el).overflowY,
    }));

    expect(dimensions.overflowX).toBe('auto');
    expect(dimensions.overflowY).toBe('auto');

    // The scrollable area must exceed the visible client area when zoomed in.
    const artboardFitsWidth = dimensions.scrollWidth <= dimensions.clientWidth;
    expect(artboardFitsWidth).toBe(false);
  });

  test('artboard is centered at Fit', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await placePhone(page);

    const canvas = page.locator('.ms-stage__canvas');
    const box = await page.locator('.ms-artboard').first().boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(canvasBox).not.toBeNull();

    // At Fit the artboard should be horizontally centered within the stage.
    const leftGap = box!.x - canvasBox!.x;
    const rightGap = canvasBox!.x + canvasBox!.width - (box!.x + box!.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);
  });
});
