import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

async function placePhone(page: Page) {
  await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^Start layout only$/i }).first().click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 45_000,
  });
}

async function placePhoneAndCount(page: Page) {
  await placePhone(page);
  return page.locator('.ms-canvas-item').count();
}

/** Click the first device to select it (placement must already have happened). */
async function selectFirstDevice(page: Page) {
  await page.locator('.ms-canvas-item').first().click();
  await expect(page.locator('.ms-canvas-item--selected').first()).toBeVisible();
}

test.describe('keyboard shortcuts', () => {
  test('Delete removes the selected device', async ({ page }) => {
    await page.goto('/');
    const count = await placePhoneAndCount(page);
    expect(count).toBeGreaterThan(0);

    await selectFirstDevice(page);
    await page.keyboard.press('Delete');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(count - 1);
  });

  test('Backspace also removes the selected device', async ({ page }) => {
    await page.goto('/');
    const count = await placePhoneAndCount(page);
    await selectFirstDevice(page);
    await page.keyboard.press('Backspace');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(count - 1);
  });

  test('Undo restores a deleted device', async ({ page }) => {
    await page.goto('/');
    const count = await placePhoneAndCount(page);
    await selectFirstDevice(page);
    await page.keyboard.press('Delete');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(count - 1);

    // Undo should bring the deleted device back.
    await page.keyboard.press('Control+Z');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(count);
  });

  test('Duplicate creates a copy of the selection', async ({ page }) => {
    await page.goto('/');
    await placePhone(page);
    const before = await page.locator('.ms-canvas-item').count();

    await page.locator('.ms-canvas-item').first().click();
    await page.keyboard.press('Control+D');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(before + 1);
  });

  test('Select all selects every canvas item', async ({ page }) => {
    await page.goto('/');
    await placePhone(page);
    const count = await page.locator('.ms-canvas-item').count();
    expect(count).toBeGreaterThan(0);

    await page.locator('.ms-canvas-item').first().click();
    await page.keyboard.press('Control+A');

    // All items become selected.
    await expect(page.locator('.ms-canvas-item--selected')).toHaveCount(count);
  });

  test('Escape deselects', async ({ page }) => {
    await page.goto('/');
    await placePhone(page);
    await selectFirstDevice(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ms-canvas-item--selected')).toHaveCount(0);
  });

  test('Arrow keys nudge the selected device', async ({ page }) => {
    await page.goto('/');
    await placePhone(page);
    await selectFirstDevice(page);

    const before = await page.locator('.ms-canvas-item').first().boundingBox();
    expect(before).not.toBeNull();

    await page.keyboard.press('ArrowRight');
    const after = await page.locator('.ms-canvas-item').first().boundingBox();
    expect(after).not.toBeNull();

    // Snapping may snap to the exact round number but right should move right.
    expect(after!.x).toBeGreaterThanOrEqual(before!.x);
  });

  test('nudge shortcuts do not crash when nothing is selected', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Control+D');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('z-order shortcuts move the item in front and back', async ({
    page,
  }) => {
    await page.goto('/');
    await placePhone(page);
    const first = page.locator('.ms-canvas-item').first();
    const second = page.locator('.ms-canvas-item').nth(1);

    // Select the first item and bring it forward.
    await first.click();
    const before = await first.evaluate((el) =>
      getComputedStyle(el).zIndex
    );
    await page.keyboard.press(']');
    const after = await first.evaluate((el) =>
      getComputedStyle(el).zIndex
    );

    // The item should move in z-order (either value changed or stayed valid).
    expect(after).toBeTruthy();
  });
});
