import { expect, type Page } from '@playwright/test';

export const DEMO_CODE = 'ABCD-EFGH-JKMN';

/** Opens the app past the install gate (e2e bypass) and the activation screen (fake service). */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}standalone=1`);
  const codeField = page.getByLabel('كود التفعيل');
  const home = page.getByRole('heading', { level: 1, name: /أهلاً يا كابتن/ });
  await expect(codeField.or(home)).toBeVisible();
  if (await codeField.isVisible()) {
    await codeField.fill(DEMO_CODE);
    await page.getByRole('button', { name: 'تفعيل' }).click();
  }
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
}

/** Swipes a row toward the inline start (right in RTL) to reveal its delete action. */
export async function swipeToReveal(page: Page, rowText: string): Promise<void> {
  const row = page.getByRole('link', { name: new RegExp(rowText) });
  const box = await row.boundingBox();
  if (!box) throw new Error('row not visible');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * 0.3 + i * 15, y);
  await page.mouse.up();
}
