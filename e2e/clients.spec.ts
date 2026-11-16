import { expect, test } from '@playwright/test';
import { openApp, swipeToReveal } from './helpers';

test('with the bypass, home renders today, ending subscriptions and demo data', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'حصص النهارده' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'اشتراكات هتخلص خلال 7 أيام' })).toBeVisible();
  await expect(page.getByText('دي بيانات تجريبية')).toBeVisible();
  await expect(page.getByRole('link', { name: /سارة محمود/ }).first()).toBeVisible();
});

test('add a client from home in three taps or fewer', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'عميل جديد' }).click(); // tap 1
  const sheet = page.getByRole('dialog', { name: 'عميل جديد' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('الاسم')).toBeFocused();
  await sheet.getByLabel('الاسم').fill('حسام فتحي');
  await sheet.getByRole('button', { name: 'حفظ' }).click(); // tap 2
  await expect(page.getByRole('heading', { level: 1, name: 'حسام فتحي' })).toBeVisible();
  await page.getByRole('link', { name: 'العملاء' }).first().click();
  await expect(page.getByRole('link', { name: /حسام فتحي/ })).toBeVisible();
});

test('add-client sheet: escape and backdrop close it; empty name is rejected', async ({ page }) => {
  await openApp(page, '/clients');
  await page.getByRole('button', { name: 'إضافة عميل' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('اكتب اسم العميل.');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'إضافة عميل' }).click();
  await page.getByTestId('sheet-backdrop').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('search folds Arabic letters and phone digits', async ({ page }) => {
  await openApp(page, '/clients');
  const search = page.getByRole('searchbox', { name: 'بحث' });
  await search.fill('ساره');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /أحمد علي/ })).toHaveCount(0);
  await search.fill('0155');
  await expect(page.getByRole('link', { name: /كريم يوسف/ })).toBeVisible();
  await expect(page.getByRole('link')).not.toContainText(['سارة محمود']);
  await search.fill('مش موجود');
  await expect(page.getByText('مفيش نتايج')).toBeVisible();
});

test('swipe to delete, then undo from the toast', async ({ page }) => {
  await openApp(page, '/clients');
  await swipeToReveal(page, 'منى حسن');
  await page.getByRole('button', { name: 'حذف منى حسن' }).click();
  await expect(page.getByRole('link', { name: /منى حسن/ })).toHaveCount(0);
  await expect(page.getByText('اتمسح منى حسن')).toBeVisible();
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByRole('link', { name: /منى حسن/ })).toBeVisible();
});

test('delete from client detail, then undo', async ({ page }) => {
  await openApp(page, '/clients');
  await page.getByRole('link', { name: /كريم يوسف/ }).click();
  await page.getByRole('button', { name: 'حذف العميل' }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole('link', { name: /كريم يوسف/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByRole('link', { name: /كريم يوسف/ })).toBeVisible();
});

test('removing demo data leaves an empty state that says what to do', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'امسح البيانات التجريبية' }).click();
  await page.getByRole('link', { name: 'العملاء' }).click();
  await expect(page.getByText('لسه مفيش عملاء')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إضافة عميل' }).last()).toBeVisible();
});

test('placeholder routes render through the tab bar and More', async ({ page }) => {
  await openApp(page);
  await page.getByRole('link', { name: 'المواعيد' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'المواعيد' })).toBeVisible();
  await page.getByRole('link', { name: 'المزيد' }).click();
  await page.getByRole('link', { name: /المكملات والمنتجات/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'المكملات والمنتجات' })).toBeVisible();
});
