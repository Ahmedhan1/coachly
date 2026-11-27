import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
import { startAppServer, type OwnServer } from './servers';

// The network goes away for real: the test stops its own copy of the app server (see servers.ts for why not
// context.setOffline). Nothing can answer after that, so whatever still works came from the phone.
let server: OwnServer;
test.beforeEach(async () => {
  server = await startAppServer();
});
test.afterEach(async () => {
  await server.stop();
});

test('works fully offline after the first load', async ({ page }) => {
  await openApp(page, `${server.origin}/`);
  // openApp returns once the service worker has precached everything and controls the page.

  await server.stop();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'باقي اليوم' })).toBeVisible();

  // A lazy route chunk that was never opened online must also come from the precache.
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /خريطة العضلات/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'خريطة العضلات' })).toBeVisible();

  // Bundled fonts come from the precache too (no network).
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return ['700 28px Rubik', '400 16px Rubik'].map((f) => document.fonts.check(f, 'نص'));
  });
  expect(fontsLoaded).toEqual([true, true]);

  // Data still reads and writes offline.
  await page.getByRole('link', { name: 'الرئيسية' }).click();
  await page.getByRole('link', { name: 'العملاء' }).click();
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  await page.getByRole('button', { name: 'إضافة عميل' }).click();
  await page.getByRole('dialog').getByLabel('الاسم').fill('عميل أوفلاين');
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'عميل أوفلاين' })).toBeVisible();

  // A deep link opened cold while offline falls back to the cached index.html.
  await page.goto(`${server.origin}/clients`);
  await expect(page.getByRole('link', { name: /عميل أوفلاين/ })).toBeVisible();
});
