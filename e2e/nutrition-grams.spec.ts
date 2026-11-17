import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const SHOTS = process.env.E2E_SHOTS ?? 'node_modules/.e2e-nutrition-shots';

/** Sara (demo data) with a saved calculation, then the auto diet screen. */
async function openDiet(page: Page): Promise<void> {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.getByRole('link', { name: /السعرات والماكروز/ }).click();
  await page.getByLabel('السن').fill('30');
  await page.getByRole('button', { name: 'حفظ للعميل' }).click();
  await page.getByRole('link', { name: 'الوجبات' }).click();
  await page.getByRole('button', { name: 'اعمل دايت أسبوع' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'دايت أوتوماتيك' })).toBeVisible();
}

const dayTotal = (page: Page) => page.getByRole('status', { name: 'مجموع اليوم' });
const kcalOf = async (page: Page) => Number((await dayTotal(page).locator('dd').first().innerText()).replace(/\D/g, ''));

test('auto diet: exact grams, live recalculation, lock and re-balance, slot-fit swaps, save', async ({ page }) => {
  await openDiet(page);
  // A week is there right away, every food with grams and its calories.
  const breakfast = page.getByRole('region', { name: 'فطار' }).first();
  await expect(breakfast).toBeVisible();
  await expect(breakfast.getByText(/\d+ جم/).first()).toBeVisible();
  await expect(breakfast.getByText(/\d+ سعر · ب \d+ · ك \d+ · د \d+/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/diet-412-top.png`, fullPage: false });

  // Typing new calories re-plans at once.
  const before = await kcalOf(page);
  const kcalField = page.getByLabel('اكتب السعرات');
  const target = Number(await kcalField.inputValue());
  await page.getByRole('button', { name: 'زوّد 50 سعر' }).click();
  await page.getByRole('button', { name: 'زوّد 50 سعر' }).click();
  await page.getByRole('button', { name: 'زوّد 50 سعر' }).click();
  await page.getByRole('button', { name: 'زوّد 50 سعر' }).click();
  await expect(kcalField).toHaveValue(String(target + 200));
  await expect.poll(() => kcalOf(page)).toBeGreaterThan(before + 100);

  // + on one food locks it; the meal stays near its target.
  const lunch = page.getByRole('region', { name: 'غدا' }).first();
  const firstMore = lunch.getByRole('button', { name: /^زوّد / }).first();
  const gramsField = lunch.getByRole('textbox', { name: /^جرامات / }).first();
  const g0 = Number(await gramsField.inputValue());
  await firstMore.click();
  await expect.poll(async () => Number(await gramsField.inputValue())).toBeGreaterThan(g0);
  await expect(lunch.getByRole('button', { name: /^فك تثبيت / }).first()).toHaveAttribute('aria-pressed', 'true');
  // Direct entry.
  await gramsField.fill('300');
  await gramsField.press('Enter');
  await expect(gramsField).toHaveValue('300');
  const mealKcal = await lunch.locator('header').innerText();
  const [have, want] = (/(\d+) من (\d+)/.exec(mealKcal) ?? []).slice(1).map(Number);
  expect(Math.abs((have ?? 0) - (want ?? 1)) / (want ?? 1)).toBeLessThan(0.15);

  // Swapping the breakfast dish offers breakfast dishes only.
  await breakfast.getByRole('button', { name: /^بدّل / }).first().click();
  const sheet = page.getByRole('dialog', { name: /بدائل لـ .* في فطار/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button').filter({ hasText: /كشري|صيادية|ماكريل/ })).toHaveCount(0);
  await sheet.getByRole('button').filter({ hasText: /سعر/ }).first().click();
  await expect(sheet).toBeHidden();

  // Save → the meal plan shows the exact grams.
  await page.getByRole('button', { name: 'احفظ كخطة للعميل' }).click();
  await expect(page.getByText(/اتحفظ 7 أيام/)).toBeVisible();
  await expect(page.getByText(/\d+ جم · \d+ سعر/).first()).toBeVisible();
});

test('food table: per-portion calories and the quick calculator', async ({ page }) => {
  await openApp(page);
  await page.goto('/more/foods?standalone=1');
  await page.getByLabel('دوّر على صنف').fill('بيض');
  await expect(page.getByText(/بيضة \(50 جم\) = 72 سعر/).first()).toBeVisible();
  await page.getByRole('button', { name: 'احسب سعرات أي كمية' }).click();
  const d = page.getByRole('dialog', { name: 'حاسبة سريعة' });
  await d.getByLabel('الصنف').selectOption({ label: 'رز أبيض مطبوخ' });
  await d.getByLabel('الكمية بالجرام').fill('150');
  await expect(d.getByRole('status')).toContainText('195 سعر');
  await expect(d.getByRole('status')).toContainText('بروتين 4 جم');
  await page.screenshot({ path: `${SHOTS}/foods-calc.png` });
});

test('English: the diet shows English food names, slots and units', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.goto('/more/foods?standalone=1');
  await page.getByLabel('Search foods').fill('Egg');
  await expect(page.getByText(/egg \(50 g\) = 72 kcal/).first()).toBeVisible();
  await page.goto('/clients?standalone=1');
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.waitForURL(/\/clients\/[^/?]+/);
  const id = page.url().split('/clients/')[1]!.split(/[/?]/)[0];
  await page.goto(`/clients/${id}/nutrition?standalone=1`);
  await page.getByLabel('Age').fill('30');
  await page.getByRole('button', { name: 'Save for client' }).click();
  await page.goto(`/clients/${id}/diet?standalone=1`);
  const breakfast = page.getByRole('region', { name: 'Breakfast' }).first();
  await expect(breakfast).toBeVisible();
  await expect(breakfast.getByText(/\d+ kcal · P \d+ · C \d+ · F \d+/).first()).toBeVisible();
  // Food names in the plan are the English ones (no Arabic letters in the meal cards).
  const text = await page.getByRole('region', { name: 'Lunch' }).first().innerText();
  expect(text).not.toMatch(/[؀-ۿ]/);
});
