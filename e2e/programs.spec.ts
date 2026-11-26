import { expect, test, type Page } from '@playwright/test';
import { openApp, waitForSavedSession } from './helpers';

async function openSaraProgramFromTemplate(page: Page) {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  // Assigning a ready program to a client: 2 taps from the client file.
  await page.getByRole('link', { name: /البرنامج/ }).first().click();
  await page.getByRole('button', { name: /فول بادي/ }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();
}

const order = (page: Page) => page.getByTestId('exercise-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-exercise')));

test('program builder: touch drag-and-drop reorders exercises', async ({ page }) => {
  await openSaraProgramFromTemplate(page);
  const before = await order(page);
  const grip = page.getByTestId('exercise-card').first().getByRole('button', { name: /^اسحب لترتيب/ });
  const target = page.getByTestId('exercise-card').nth(2);
  const a = await grip.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw new Error('cards not visible');
  const cdp = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const y0 = a.y + a.height / 2;
  const y1 = b.y + b.height * 0.75;
  await touch('touchStart', y0);
  await page.waitForTimeout(300); // hold past the activation delay
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', y0 + ((y1 - y0) * i) / 12);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', y1);
  await expect.poll(() => order(page)).not.toEqual(before);
  const after = await order(page);
  expect(after[0]).toBe(before[1]);
  expect(after.indexOf(before[0] ?? '')).toBeGreaterThan(0);
});

test('program builder: copy the week and copy the program to another client', async ({ page }) => {
  await openSaraProgramFromTemplate(page);
  await page.getByRole('button', { name: 'انسخ', exact: true }).click();
  await page.getByRole('button', { name: 'انسخ الأسبوع كله' }).click();
  await expect(page.getByText(/أسبوع 2/).first()).toBeVisible();
  await page.getByRole('button', { name: 'خيارات البرنامج' }).click();
  await page.getByRole('button', { name: 'انسخه لعميل تاني' }).click();
  const picker = page.getByRole('dialog', { name: 'انسخه لعميل تاني' });
  await picker.getByRole('button').filter({ hasNotText: /سارة محمود|إلغاء|إغلاق/ }).first().click();
  await expect(page.getByText(/^اتنسخ لـ/)).toBeVisible();
});

test('session: resumes after a reload and never overwrites an unsaved session silently', async ({ page }) => {
  await openSaraProgramFromTemplate(page);
  await page.getByRole('button', { name: 'خيارات البرنامج' }).click();
  await page.getByRole('button', { name: 'ابدأ حصة باليوم ده' }).click();
  await page.getByRole('button', { name: 'زوّد العدات' }).click();
  await page.getByRole('button', { name: 'خلّصت السيت' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  const url = page.url();

  // App killed and reopened on the same session: the set and the running rest timer are back.
  await waitForSavedSession(page, 1);
  await page.reload();
  await expect(page.getByText('1 من 16 سيت')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'يلا السيت الجاية' }).click();

  // Starting a session for another client asks first.
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
  const hrefs = await page
    .locator('a[href^="/clients/"]')
    .evaluateAll((els) => els.filter((e) => !e.textContent?.includes('سارة محمود')).map((e) => e.getAttribute('href') ?? ''));
  const otherHref = hrefs.find((h) => /^\/clients\/[^/?]+$/.test(h)) ?? null;
  expect(otherHref).not.toBeNull();
  const otherId = otherHref?.split('/')[2] ?? '';
  await page.goto(`/session/new?client=${otherId}&standalone=1`);
  await expect(page.getByRole('heading', { name: 'فيه حصة لسه ما اتحفظتش مع سارة محمود' })).toBeVisible();
  await page.getByRole('button', { name: 'كمّل الحصة دي' }).click();
  await expect(page.getByText('1 من 16 سيت')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('client')).toBe(new URL(url).searchParams.get('client'));
});
