import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

const SHOTS = process.env.E2E_SHOTS ?? 'node_modules/.e2e-activity-shots';

/** What clients sent from their pages stays on Home (who, what, when) until the trainer opens that client. */
test('home: "new from your clients" lists who sent what and when; opening the client clears it', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('pt-coach');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const clients: { id: string; name: string; deletedAt: number | null }[] = await new Promise((res) => {
      const r = db.transaction('clients').objectStore('clients').getAll();
      r.onsuccess = () => res(r.result as never);
    });
    const sara = clients.find((c) => c.name.startsWith('سارة') && c.deletedAt === null);
    if (!sara) throw new Error('demo client missing');
    const at = Date.now() - 5 * 60_000;
    await new Promise((res) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({
        key: 'backup.activity',
        value: [{ id: 'chk-e2e', kind: 'checkin', clientId: sara.id, at, seen: false, note: 'ينفع أبدّل الرز ببطاطس؟' }],
      });
      tx.oncomplete = () => res(null);
    });
    db.close();
  });
  await page.reload(); // Dexie only sees its own writes
  const card = page.locator('section', { has: page.getByRole('heading', { name: /^جديد من عملائك/ }) });
  await expect(card).toBeVisible();
  await expect(card.getByText(/سارة محمود بعت متابعة/)).toBeVisible();
  await expect(card.getByText('«ينفع أبدّل الرز ببطاطس؟»')).toBeVisible();
  await page.waitForTimeout(800); // launch splash fades out
  await page.screenshot({ path: `${SHOTS}/home-activity.png` });
  await card.getByRole('link', { name: /سارة محمود/ }).click();
  await expect(page).toHaveURL(/\/clients\/[^?]+\?tab=progress/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: /^جديد من عملائك/ })).toHaveCount(0);
});

test('meal plan: the day totals never push the page wider than the screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.getByRole('link', { name: /السعرات والماكروز/ }).click();
  await page.getByLabel('السن').fill('30');
  await page.getByRole('button', { name: 'حفظ للعميل' }).click();
  await page.getByRole('link', { name: 'الوجبات' }).click();
  await page.getByRole('button', { name: 'ابدأ أول يوم' }).click();
  await expect(page.getByTestId('day-totals')).toBeVisible();
  await page.waitForTimeout(6000); // the save toast goes away
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/meal-plan.png` });
});
