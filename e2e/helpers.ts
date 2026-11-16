import { expect, type Page } from '@playwright/test';

export const DEMO_CODE = 'ABCD-EFGH-JKMN';
export const ADD_BUTTON = 'إضافة: عميل، حصة، برنامج';

/** Fake activation with the demo code (e2e build). Leaves the app on the identity setup screen. */
export async function activateWithFakeCode(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}standalone=1`);
  await page.getByLabel('كود التفعيل').fill(DEMO_CODE);
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
}

/** Opens the app past the install gate (e2e bypass), activation (fake service) and identity setup (skipped). */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}standalone=1`);
  const codeField = page.getByLabel('كود التفعيل');
  const later = page.getByRole('button', { name: 'بعدين' });
  const tabs = page.getByRole('navigation', { name: 'التنقل الرئيسي' });
  const backToClients = page.getByRole('link', { name: 'رجوع للعملاء' });
  await expect(codeField.or(later).or(tabs).or(backToClients)).toBeVisible();
  if (await codeField.isVisible()) {
    await codeField.fill(DEMO_CODE);
    await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await expect(later.or(tabs)).toBeVisible();
  }
  if (await later.isVisible()) await later.click();
  await expect(tabs.or(backToClients)).toBeVisible();
}

/** Center "+" → "عميل جديد": the add-client sheet. */
export async function openAddClient(page: Page): Promise<void> {
  await page.getByRole('button', { name: ADD_BUTTON }).click();
  await page.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /عميل جديد/ }).click();
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
