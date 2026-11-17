import { expect, test } from '@playwright/test';
import { openAddClient, openApp } from './helpers';

test('backup: encrypted file export → change data → restore from the file brings the old data back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    // No file share sheet (Android Chrome / desktop): the backup is downloaded.
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  await openApp(page);
  await page.goto('/more/settings/backup?standalone=1');
  await page.getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  const sheet = page.getByRole('dialog', { name: 'اعمل ملف نسخة' });
  await sheet.getByLabel('كلمة السر', { exact: true }).fill('secret-pass-1');
  await sheet.getByLabel('اكتبها تاني').fill('secret-pass-1');
  await sheet.getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  const ready = page.getByRole('button', { name: /الملف جاهز/ });
  await expect(ready).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download');
  await ready.click();
  const file = await (await download).path();
  // A download must tell the trainer where the file went.
  await expect(page.getByText(/اتنزّل في «التنزيلات»/)).toBeVisible();

  // Change data after the backup: a new client.
  await page.goto('/clients?standalone=1');
  await openAddClient(page);
  const add = page.getByRole('dialog', { name: 'عميل جديد' });
  await add.getByLabel('الاسم').fill('عميل بعد النسخة');
  await add.getByRole('button', { name: 'حفظ' }).click();
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
  await page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 });
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /عميل بعد النسخة/ })).toHaveCount(0);
});
