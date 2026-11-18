import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
for (const add of [false, true]) {
  test(`dbg pdf add=${add}`, async ({ page }) => {
    test.setTimeout(200_000);
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await openApp(page);
    await page.getByRole('link', { name: 'العملاء', exact: true }).click();
    await page.getByRole('link', { name: /سارة محمود/ }).click();
    const clientId = page.url().split('/clients/')[1]?.split(/[/?]/)[0] ?? '';
    await page.getByRole('link', { name: /البرنامج/ }).first().click();
    await page.getByRole('button', { name: /فول بادي/ }).click();
    await expect(page.getByTestId('exercise-card').first()).toBeVisible();
    if (add) {
      await page.getByRole('button', { name: 'ضيف تمرين' }).first().click();
      const picker = page.getByRole('dialog', { name: 'ضيف تمرين' });
      await picker.getByRole('searchbox').or(picker.getByRole('textbox')).first().fill('سبانيش');
      await picker.getByText('سبانيش سكوات', { exact: true }).first().click();
      await expect(page.getByTestId('exercise-card').filter({ hasText: 'سبانيش سكوات' })).toBeVisible();
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2500);
    await page.goto(`/more/pdf?client=${clientId}&standalone=1`);
    await page.getByLabel('نوع الملف').selectOption({ label: 'برنامج كامل' });
    for (const name of ['الغلاف', 'جدول التمارين']) {
      const box = page.getByRole('checkbox', { name, exact: true });
      if ((await box.isChecked()) !== (name === 'جدول التمارين')) await box.click();
    }
    await page.getByRole('button', { name: 'اعمل الملف' }).click();
    await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 150_000 });
    console.log('RESULT', await page.getByText(/الملف جاهز/).textContent());
  });
}
