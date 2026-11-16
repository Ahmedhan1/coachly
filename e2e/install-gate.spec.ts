import { expect, test } from '@playwright/test';

test('a normal browser tab shows the add-to-home-screen instructions and refuses to continue', async ({ page }) => {
  await page.goto('/');
  const gate = page.getByTestId('install-gate');
  await expect(gate).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ثبّت التطبيق على الشاشة الرئيسية');
  await expect(gate).toContainText('إضافة إلى الشاشة الرئيسية');
  await expect(page.getByRole('img', { name: 'رسم لزرار المشاركة' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);

  await page.goto('/clients');
  await expect(gate).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
