import { expect, test, type Page } from '@playwright/test';
import { openAddClient, openApp } from './helpers';

/** Reported bug: 1,000 package, 300 recorded as paid, 150 pending → the hub said "باقي عليه 150". Must be 700. */
async function recordPayment(page: Page, amount: string, pending: boolean): Promise<void> {
  await page.getByRole('button', { name: 'سجّل دفعة' }).click();
  const sheet = page.getByRole('dialog', { name: 'دفعة جديدة' });
  await sheet.getByLabel(/^المبلغ/).fill(amount);
  if (pending) await sheet.locator('label').filter({ hasText: 'مستني' }).click();
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(sheet).toBeHidden();
}

test('money tab: balance is the package price minus what was paid, and updates on every payment', async ({ page }) => {
  await openApp(page, '/clients');
  await openAddClient(page);
  const add = page.getByRole('dialog', { name: 'عميل جديد' });
  await add.getByLabel('الاسم').fill('محمد هاني');
  await add.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'محمد هاني' })).toBeVisible();

  await page.getByRole('tab', { name: 'الفلوس' }).click();
  await page.getByRole('button', { name: /عدّل الباقة|باقة جديدة|ضيف باقة/ }).first().click();
  const pkg = page.getByRole('dialog');
  await pkg.getByLabel('عدد الحصص').fill('30');
  await pkg.getByLabel(/^السعر/).fill('1000');
  await pkg.getByRole('button', { name: 'حفظ' }).click();
  await expect(pkg).toBeHidden();

  await expect(page.getByText(/^باقي عليه 1,000 ج\.م · اتدفع 0 ج\.م من 1,000 ج\.م$/)).toBeVisible();
  await recordPayment(page, '300', false);
  await expect(page.getByText(/^باقي عليه 700 ج\.م · اتدفع 300 ج\.م من 1,000 ج\.م$/)).toBeVisible();
  await recordPayment(page, '150', true);
  await expect(page.getByText(/^باقي عليه 700 ج\.م · اتدفع 300 ج\.م من 1,000 ج\.م$/)).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 3000)); // WebKit on a touch device has no mouse wheel
  await expect(page.getByText('اتسجلت الدفعة')).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: process.env.PAY_SHOT ?? 'test-results/payments-balance.png', fullPage: false });
  await recordPayment(page, '700', false);
  // Package paid; the pending 150 above what the package needs is still shown as owed (an extra).
  await expect(page.getByText(/^باقي عليه 150 ج\.م · الباقة مدفوعة بالكامل$/)).toBeVisible();
});
