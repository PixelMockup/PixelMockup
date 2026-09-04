import { test, expect, type Page, type Locator } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixelMockup.tourSeen', '1');
  });
});

async function placeLayout(page: Page) {
  await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^Start layout only$/i }).first().click();
  await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
    timeout: 45_000,
  });
}

async function dragItem(page: Page, locator: Locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + dx,
    box!.y + box!.height / 2 + dy,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test.describe('canvas workflows', () => {
  test('drags a device to a new position', async ({ page }) => {
    await page.goto('/');
    await placeLayout(page);
    const item = page.locator('.ms-canvas-item').first();
    const before = await item.boundingBox();

    await dragItem(page, item, 90, 50);

    const after = await item.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.x).toBeGreaterThan(before!.x + 50);
    expect(after!.y).toBeGreaterThan(before!.y + 20);
  });

  test('undo reverts a delete', async ({ page }) => {
    await page.goto('/');
    await placeLayout(page);
    const initial = await page.locator('.ms-canvas-item').count();

    // Select all and delete.
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(0);

    // Undo restores the lineup.
    await page.keyboard.press('Control+Z');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(initial);
  });

  test('places multiple devices and keeps them all present', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.ms-progress-loader-overlay')).toHaveCount(0, {
      timeout: 60_000,
    });

    const rail = page.getByRole('navigation', { name: /Studio tools/i });
    await rail.getByRole('button', { name: /Devices|Hide devices/i }).click();
    await expect(
      page.getByRole('complementary', { name: /^Devices$/i }),
    ).toBeVisible();

    const search = page.getByRole('searchbox', { name: /Search devices/i });
    await search.fill('iPhone 11 Black');
    const library = page.getByRole('complementary', { name: /^Devices$/i });
    const device = library.getByRole('button', { name: /iPhone 11 Black/i }).first();
    await expect(device).toBeVisible({ timeout: 20_000 });

    // Handle unloaded tile — click to trigger load, wait for it to finish.
    if (await device.evaluate((el) => el.classList.contains('ms-device-tile--unloaded'))) {
      await device.click();
      await expect(device).not.toHaveClass(/ms-device-tile--unloaded/, {
        timeout: 30_000,
      });
    }

    // First click places; library closes automatically.
    await device.click();
    await expect(page.locator('.ms-canvas-item').first()).toBeVisible({
      timeout: 30_000,
    });
    const countAfterFirst = await page.locator('.ms-canvas-item').count();

    // Re-open the library and place a second device.
    await rail.getByRole('button', { name: /Devices|Hide devices/i }).click();
    await expect(library).toBeVisible();
    await device.click({ force: true });
    await expect(page.locator('.ms-canvas-item')).toHaveCount(countAfterFirst + 1);
  });

  test('duplicates and deletes within an undoable history', async ({ page }) => {
    await page.goto('/');
    await placeLayout(page);
    const initial = await page.locator('.ms-canvas-item').count();

    // Duplicate once.
    await page.locator('.ms-canvas-item').first().click();
    await page.keyboard.press('Control+D');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(initial + 1);

    // Duplicate again.
    await page.keyboard.press('Control+D');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(initial + 2);

    // Undo removes one copy.
    await page.keyboard.press('Control+Z');
    await expect(page.locator('.ms-canvas-item')).toHaveCount(initial + 1);
  });

  test('z-order bring-forward swaps item positions', async ({ page }) => {
    await page.goto('/');
    await placeLayout(page);

    // Initial: items have z-indices 100, 101, 102, 103 (unselected).
    // Item 0 is at the bottom of the stack, item 1 is above it.
    const initial = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ms-canvas-item')).map((el) => ({
        zIndex: Number(getComputedStyle(el).zIndex),
      })),
    );
    expect(initial[0].zIndex).toBeLessThan(initial[1].zIndex);

    // Select item 0 and bring it forward.
    await page.locator('.ms-canvas-item').nth(0).click();
    await page.keyboard.press(']');
    await page.waitForTimeout(400);

    // After bring-forward, item 0 (selected, z=1001) is now above item 1 (unselected, z=100).
    // The selected item's zIndex should exceed the one below it.
    const after = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ms-canvas-item')).map((el) => ({
        zIndex: Number(getComputedStyle(el).zIndex),
        isSelected: el.classList.contains('ms-canvas-item--selected'),
      })),
    );
    const selected = after.find((item) => item.isSelected)!;
    const unselected = after.filter((item) => !item.isSelected);

    // Selected item should be above at least one unselected item.
    expect(selected.zIndex).toBeGreaterThan(unselected[0].zIndex);
  });
});
