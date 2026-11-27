import { expect, test } from '@playwright/test';
import { emulateDownloadOnlySave, openAddClient, openApp, saveDeviceBackup } from './helpers';

test('backup: encrypted file export → change data → restore from the file brings the old data back', async ({ page }) => {
  test.setTimeout(120_000);
  await emulateDownloadOnlySave(page);
  await openApp(page);
  await page.goto('/more/settings/backup?standalone=1');
  const file = await (await saveDeviceBackup(page, 'secret-pass-1')).path();
  // The screen now remembers the backup.
  await expect(page.getByText(/آخر ملف:/)).toBeVisible();

  // Change data after the backup: a new client.
  await page.goto('/clients?standalone=1');
  await openAddClient(page);
  const add = page.getByRole('dialog', { name: 'عميل جديد' });
  await add.getByLabel('الاسم').fill('عميل بعد النسخة');
  await add.getByRole('button', { name: 'حفظ' }).click();
  // Leave only once the save went through (a reload mid-write would drop it).
  await expect(add).toBeHidden();
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /عميل بعد النسخة/ })).toBeVisible();

  // Restore.
  await page.goto('/more/settings/backup?standalone=1');
  await page.getByRole('button', { name: 'استرجاع من ملف' }).click();
  const imp = page.getByRole('dialog', { name: 'استرجاع من ملف' });
  await imp.locator('input[type=file]').setInputFiles(file!);
  await imp.getByLabel('كلمة السر').fill('secret-pass-1');
  page.on('dialog', (d) => void d.accept());
  await imp.getByRole('button', { name: 'أيوه، استرجع' }).click();
  // The app reopens itself at "/" (location.replace). Navigate only once that page is up: a goto sent earlier
  // races the app's own navigation, and WebKit cancels ours.
  await page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'النهارده' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /عميل بعد النسخة/ })).toHaveCount(0);
});
