import { expect, test, type Page } from '@playwright/test';
import { emulateDownloadOnlySave, openApp, saveDeviceBackup } from './helpers';

/** Opens the demo client "سارة محمود" from the clients tab. */
async function openSara(page: Page) {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'سارة محمود' })).toBeVisible();
}

test('build a program from a template for a client, then run a session and save it', async ({ page }) => {
  await openSara(page);
  await page.getByRole('link', { name: /البرنامج/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: /برامج سارة محمود|البرامج/ })).toBeVisible();
  await page.getByRole('button', { name: /فول بادي/ }).click();
  await expect(page.getByTestId('save-status')).toBeVisible();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();

  await page.getByRole('button', { name: 'خيارات البرنامج' }).click();
  await page.getByRole('button', { name: 'ابدأ حصة باليوم ده' }).click();
  await expect(page.getByRole('button', { name: 'خلّصت السيت' })).toBeVisible();
  await page.getByRole('button', { name: 'زوّد العدات' }).click();
  await page.getByRole('button', { name: 'خلّصت السيت' }).click();
  // rest overlay, then skip it
  const skipRest = page.getByRole('button', { name: 'يلا السيت الجاية' });
  if (await skipRest.isVisible()) await skipRest.click();
  await page.getByRole('button', { name: 'خلّص الحصة' }).first().click();
  await page.getByRole('dialog', { name: 'ملخص الحصة' }).getByRole('button', { name: 'احفظ الحصة' }).click();
  await expect(page.getByRole('heading', { name: 'الحصة اتحفظت' })).toBeVisible();
});

test('calories calculator computes and saves for a client', async ({ page }) => {
  await openSara(page);
  await page.getByRole('link', { name: /السعرات والماكروز/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'حاسبة السعرات' })).toBeVisible();
  await page.getByLabel('السن').fill('30');
  await expect(page.getByText('سعر في اليوم').first()).toBeVisible();
  await page.getByRole('button', { name: 'حفظ للعميل' }).click();
  await expect(page.getByText(/اتحفظت سعرات/)).toBeVisible();
});

test('supplements catalog: add a product without any suggested dose', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /المكملات والمنتجات/ }).click();
  await page.getByRole('button', { name: 'منتج جديد' }).click();
  const sheet = page.getByRole('dialog', { name: 'منتج جديد' });
  await expect(sheet.getByLabel(/الجرعة/)).toHaveValue('');
  await sheet.getByLabel('الاسم').fill('بروتين تجريبي');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('button', { name: 'بروتين تجريبي من غير جرعة' })).toBeVisible();
});

test('progress: add a measurement and see it listed', async ({ page }) => {
  await openSara(page);
  await page.getByRole('link', { name: /التقدم والصور/ }).click();
  await page.getByRole('button', { name: 'قياس جديد' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'قياس جديد' });
  await sheet.getByLabel('الوزن (كجم)').fill('71.5');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(/71\.5 كجم/).first()).toBeVisible();
});

test('progress: neck + waist + hip estimate body fat (Navy) when the body fat box is empty', async ({ page }) => {
  await openSara(page); // female, 165 cm
  await page.getByRole('link', { name: /التقدم والصور/ }).click();
  await page.getByRole('button', { name: 'قياس جديد' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'قياس جديد' });
  await sheet.getByLabel('الوسط (سم)').fill('80');
  await sheet.getByLabel('الرقبة (سم، لحساب نسبة الدهون)').fill('32');
  await expect(sheet.getByText(/محتاجين كمان: الهيب/)).toBeVisible();
  await sheet.getByLabel('الهيب (سم)').fill('100');
  await expect(sheet.getByTestId('navy-estimate')).toContainText('معادلة نيفي');
  await page.screenshot({ path: 'test-results/shots/progress-navy-estimate.png' });
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(/% \(تقدير نيفي\)/).first()).toBeVisible();
});

test('PDF builder makes a file for a client offline-capable, with share and download', async ({ page }) => {
  test.setTimeout(90_000);
  await openSara(page);
  await page.getByRole('button', { name: 'ابعت البرنامج' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'منشئ الـ PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'اعمل الملف' }).click();
  await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'نزّل الملف' })).toBeVisible();
});

test('local backup: save an encrypted file to the phone', async ({ page }) => {
  await emulateDownloadOnlySave(page);
  await openApp(page);
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /الإعدادات/ }).first().click();
  await page.getByRole('link', { name: /النسخ الاحتياطي/ }).click();
  const file = await saveDeviceBackup(page, 'secret-pass-1');
  expect(file.suggestedFilename()).toMatch(/\./);
});

test('income dashboard renders from demo payments', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /^الدخل/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'الدخل' })).toBeVisible();
});
