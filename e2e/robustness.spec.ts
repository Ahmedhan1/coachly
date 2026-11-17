import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/** Export a plain backup of the demo data through the real screen and save it to `path`. */
async function exportBackup(page: Page, path: string): Promise<void> {
  await openApp(page, '/more/settings/backup');
  await page.getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  await page.getByRole('dialog').getByRole('checkbox').uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  const ready = page.getByRole('button', { name: /الملف جاهز/ });
  await expect(ready).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), ready.click()]);
  await download.saveAs(path);
}

test('a truncated backup is refused with the error message and current data stays', async ({ page }, testInfo) => {
  const full = testInfo.outputPath('backup.zip');
  await exportBackup(page, full);
  const bytes = readFileSync(full);
  const cut = testInfo.outputPath('truncated.zip');
  writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  const junk = testInfo.outputPath('junk.zip');
  writeFileSync(junk, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2000, 7)]));

  page.on('dialog', (d) => void d.accept());
  for (const file of [cut, junk]) {
    await page.getByRole('button', { name: 'استرجاع من ملف' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.locator('input[type=file]').setInputFiles(file);
    const confirm = sheet.getByRole('button', { name: 'أيوه، استرجع' });
    const alert = sheet.getByRole('alert');
    // Either detection already refuses it, or the restore does after the confirm.
    await expect(alert.or(confirm)).toBeVisible();
    if (!(await alert.isVisible()) && (await confirm.isEnabled())) await confirm.click();
    await expect(alert).toHaveText(/بايظ|ناقص|مش نسخة احتياطية|ما نجحش/);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
});

test('a backup from this version restores (round trip through the screen)', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('backup.zip');
  await exportBackup(page, file);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'استرجاع من ملف' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'أيوه، استرجع' }).click();
  await expect(page.getByRole('heading', { name: 'باقي اليوم' })).toBeVisible();
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
});

test('a full disk: saving a client reports the failure instead of losing it silently', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'quota override needs the Chrome DevTools Protocol');
  await openApp(page, '/clients');
  const cdp = await page.context().newCDPSession(page);
  const origin = new URL(page.url()).origin;
  const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: usage + 1 });
  await page.getByRole('button', { name: 'إضافة عميل' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('الاسم').fill('عميل 💪 مساحة خلصانة');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  // The sheet stays open with an error (and, once the shell mounts the storage toasts, a "storage full" toast).
  await expect(sheet.getByRole('alert').or(page.getByText('مساحة الموبايل خلصت'))).toBeVisible();
  await cdp.send('Storage.overrideQuotaForOrigin', { origin });
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'عميل 💪 مساحة خلصانة' })).toBeVisible();
});

test('two tabs: a newer version upgrading the database is not blocked by this tab', async ({ page, context }) => {
  await openApp(page, '/clients');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  // Simulates a newer build in another tab: opens the same database at a higher version.
  const upgraded = await other.evaluate(async () => {
    const current = await new Promise<number>((resolve, reject) => {
      const r = indexedDB.open('pt-coach');
      r.onsuccess = () => {
        const v = r.result.version;
        r.result.close();
        resolve(v);
      };
      r.onerror = () => reject(r.error);
    });
    return new Promise<string>((resolve) => {
      const r = indexedDB.open('pt-coach', current + 10);
      const timer = setTimeout(() => resolve('blocked forever'), 10_000);
      r.onupgradeneeded = () => undefined;
      r.onsuccess = () => {
        clearTimeout(timer);
        r.result.close();
        resolve('upgraded');
      };
      r.onerror = () => resolve(String(r.error));
    });
  });
  expect(upgraded).toBe('upgraded');
  await other.close();
});

test.fixme('two tabs: the old tab shows a reload prompt (needs <AppStorageProblemToasts/> in AppShell)', async ({ page, context }) => {
  await openApp(page, '/clients');
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(async () => {
    const r = indexedDB.open('pt-coach');
    const v = await new Promise<number>((res) => (r.onsuccess = () => (r.result.close(), res(r.result.version))));
    await new Promise((res) => (indexedDB.open('pt-coach', v + 10).onsuccess = res));
  });
  await expect(page.getByText('التطبيق اتفتح بنسخة أحدث')).toBeVisible();
  await page.getByRole('button', { name: 'تحديث' }).click();
});
