import { test, expect } from '@playwright/test';

test('multiple tabs stay independent without crashing', async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto('/');
  await pageB.goto('/');

  await expect(pageA.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();
  await expect(pageB.getByRole('heading', { name: /Pixel Mockup/i })).toBeVisible();

  await pageA.getByRole('banner').getByRole('button', { name: /mode active/i }).click();
  await expect(pageA.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await expect(pageB.locator('#root')).toBeVisible();

  await context.close();
});
