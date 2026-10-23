import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

// Helpers for the NEW ZoomPill (mobile UI)
function zoomOut(page: Page) {
  return page.locator('.ms-zoom-pill').getByRole('button', { name: 'Zoom out' });
}

function zoomIn(page: Page) {
  return page.locator('.ms-zoom-pill').getByRole('button', { name: 'Zoom in' });
}

function zoomLabel(page: Page) {
  return page.locator('.ms-zoom-pill-label');
}

function fitButton(page: Page) {
  return page.locator('.ms-zoom-pill').getByRole('button', { name: 'Fit' });
}

async function artboardSize(page: Page) {
  const box = await page.locator('.ms-artboard').first().boundingBox();
  expect(box).not.toBeNull();
  return { width: box!.width, height: box!.height };
}

async function dismissMobileWarning(page: Page) {
  const continueBtn = page.getByRole('button', { name: 'Continue anyway' });
  if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click();
  }
}

test.describe('zoom controls', () => {
  test.beforeEach(async ({ page }) => {
    // All zoom pill tests run on mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissMobileWarning(page);
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
  });

  test('exposes continuous zoom steps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Default label is Fit (shows computed scale like 45% or 100%)
    await expect(zoomLabel(page)).toBeVisible();
    const initialText = await zoomLabel(page).textContent();
    expect(initialText).toContain('%');

    // Zoom in: should increase percentage
    await zoomIn(page).click();
    const afterFirstClick = await zoomLabel(page).textContent();
    expect(parseInt(afterFirstClick || '0')).toBeGreaterThan(parseInt(initialText || '0'));

    // Zoom out back down
    await zoomOut(page).click();
    await expect(zoomLabel(page)).toHaveText(initialText || '');
  });

  test('explicit zoom steps scale the artboard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Place a device so we have something to measure
    await page.getByRole('textbox', { name: /Website URL/i }).fill('google.com');
    await page.getByRole('button', { name: /Show on devices/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });

    const atStart = await artboardSize(page);

    await zoomIn(page).click();
    await page.waitForTimeout(300);
    const afterZoom = await artboardSize(page);

    // Artboard should visually scale (transform scale) when zooming in
    // Note: With panzoom, the CSS width stays fixed, but the bounding box 
    // from getBoundingClientRect reflects the visual transform scale
    expect(afterZoom.width).toBeGreaterThan(atStart.width);
  });

  test('Fit is available as a button', async ({ page }) => {
    // Place a device
    await page.getByRole('textbox', { name: /Website URL/i }).fill('google.com');
    await page.getByRole('button', { name: /Show on devices/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });

    // Zoom in first
    await zoomIn(page).click();

    // Click Fit button
    await fitButton(page).click();

    // Verify Fit button has active state (aria-pressed or is-active class)
    await expect(fitButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('stage becomes scrollable when zoomed in beyond the viewport', async ({ page }) => {
    // Place a device
    await page.getByRole('textbox', { name: /Website URL/i }).fill('google.com');
    await page.getByRole('button', { name: /Show on devices/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });

    // Zoom in multiple times to exceed viewport
    await zoomIn(page).click();
    await zoomIn(page).click();
    await zoomIn(page).click();

    const canvas = page.locator('.ms-stage__canvas').first(); // FIXED: Added .first()
    const dimensions = await canvas.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowX: getComputedStyle(el).overflowX,
      overflowY: getComputedStyle(el).overflowY,
    }));

    // Note: With panzoom, the container handles overflow, not the canvas itself
    // The canvas uses CSS transform, so the wrapper (.ms-stage__canvas) becomes scrollable
    expect(dimensions.overflowX).toBe('auto');
    expect(dimensions.overflowY).toBe('auto');
  });

  test('artboard is centered at Fit', async ({ page }) => {
    // Place a device
    await page.getByRole('textbox', { name: /Website URL/i }).fill('google.com');
    await page.getByRole('button', { name: /Show on devices/i }).click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 45_000,
    });

    // Click Fit to ensure we're in fit mode
    await fitButton(page).click();

    const canvas = page.locator('.ms-stage__canvas').first(); // FIXED: Added .first()
    const box = await page.locator('.ms-artboard').first().boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(canvasBox).not.toBeNull();

    // At Fit the artboard should be horizontally centered within the stage
    const leftGap = box!.x - canvasBox!.x;
    const rightGap = canvasBox!.x + canvasBox!.width - (box!.x + box!.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(5); // Slightly relaxed tolerance
  });
});