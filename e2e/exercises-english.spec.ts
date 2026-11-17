import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/**
 * English exercise data: names, cues, muscles, equipment and search in both languages.
 * The app is activated in Arabic (helpers speak Arabic), then switched to English the way Settings does it.
 */
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/en-exercises';
const ARABIC = /[؀-ۿ]/;

async function switchToEnglish(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.reload();
  await settle(page);
}

/** The boot splash fades out after start-up; screenshots wait until it is gone. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('#boot-splash')).toHaveCount(0, { timeout: 10_000 });
}

test.use({ viewport: { width: 412, height: 915 } });

test('exercise library, search, filters and detail in English', async ({ page }) => {
  await openApp(page, '/exercises');
  await switchToEnglish(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const list = page.getByRole('list').filter({ has: page.getByRole('listitem') }).first();
  const first = list.getByRole('listitem').first();
  await expect(first.getByText('Barbell Bench Press', { exact: true })).toBeVisible();
  await expect(first.getByText('Chest', { exact: true })).toBeVisible();
  await expect(first.getByText('Barbell', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/library.png` });

  // Search matches English and Arabic names alike.
  const search = page.getByRole('searchbox').first();
  await search.fill('romanian');
  await expect(list.getByText('Romanian Deadlift', { exact: true })).toBeVisible();
  await search.fill('رومانيان');
  await expect(list.getByText('Romanian Deadlift', { exact: true })).toBeVisible();
  await search.fill('lat pulldown');
  await expect(list.getByText('Lat Pulldown (Wide Grip)', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/search.png` });
  await search.fill('');

  // Filters show English muscle, equipment and level names.
  await page.getByRole('button', { name: 'Filters' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  for (const label of ['Glutes', 'Quads', 'Hamstrings', 'Bodyweight', 'Beginner']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/filters.png` });
  await sheet.getByRole('button', { name: 'Glutes', exact: true }).click();
  await sheet.getByRole('button', { name: /\d+/ }).last().click();
  await expect(list.getByRole('listitem').first().getByText('Glutes').first()).toBeVisible();

  // Detail: English name, the Arabic name as the second line, English cues and facts.
  await page.goto('/exercises/Barbell_Bench_Press_-_Medium_Grip?standalone=1');
  await settle(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Barbell Bench Press' })).toBeVisible();
  await expect(page.getByText('بنش برس بالبار', { exact: true })).toBeVisible();
  await expect(page.getByText('Pull your shoulder blades back and pin them to the bench')).toBeVisible();
  await expect(page.getByText('Strength', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/detail.png`, fullPage: true });
});

test("a trainer's rename wins in English too", async ({ page }) => {
  await openApp(page, '/exercises/Romanian_Deadlift');
  await page.getByRole('button', { name: 'غيّر الاسم' }).click();
  const rename = page.getByRole('dialog', { name: 'اسم التمرين' });
  await rename.getByLabel('الاسم اللي هيظهر للعميل').fill('آر دي إل الكابتن');
  await rename.getByRole('button', { name: 'حفظ' }).click();
  await switchToEnglish(page);
  await expect(page.getByRole('heading', { level: 1, name: 'آر دي إل الكابتن' })).toBeVisible();
});

test('program builder picker and session show English exercise names', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.getByRole('link', { name: /البرنامج/ }).first().click();
  await page.getByRole('button', { name: /فول بادي/ }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();

  await switchToEnglish(page);
  const card = page.getByTestId('exercise-card').first();
  await expect(card).toBeVisible();
  const cardText = (await card.innerText()).split('\n')[0] ?? '';
  expect(cardText).not.toMatch(ARABIC);

  await page.getByRole('button', { name: 'Add exercise' }).first().click();
  const picker = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(picker.getByRole('radio', { name: 'Glutes' })).toBeVisible();
  await picker.getByRole('searchbox').fill('هيب ثرست');
  await expect(picker.getByRole('button', { name: 'Add Barbell Hip Thrust' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/picker.png` });
  await picker.getByRole('button', { name: 'Add Barbell Hip Thrust' }).click();
  await expect(page.getByTestId('exercise-card').filter({ hasText: 'Barbell Hip Thrust' })).toBeVisible();

  await page.getByRole('button', { name: 'Program options' }).click();
  await page.getByRole('button', { name: 'Start a session with this day' }).click();
  await expect(page.getByRole('heading').filter({ hasNotText: ARABIC }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/session.png` });
});
