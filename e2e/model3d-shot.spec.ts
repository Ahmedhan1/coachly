import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('3D muscle model renders', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.goto('/more/muscle-map?view=3d&standalone=1');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/screenshots/final/model3d.png' });
  await expect(page.locator('canvas').first()).toBeVisible();
  const box = await page.locator('canvas').first().boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.27);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/screenshots/final/model3d-selected.png', fullPage: true });
});
