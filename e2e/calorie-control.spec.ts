import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const SHOTS = process.env.E2E_SHOTS ?? 'node_modules/.e2e-calcontrol-shots';

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
  await expect(page.getByRole('heading', { level: 1, name: 'دايت أوتوماتيك' })).toBeVisible({ timeout: 20_000 });
  // The starter cookbook may still be seeding on a fresh install.
  await expect(page.getByRole('region', { name: 'فطار' }).first()).toBeVisible({ timeout: 30_000 });
}

const mealTarget = async (page: Page, name: string) => {
  const text = await page.getByRole('region', { name }).first().locator('header').innerText();
  return Number((/\d+ من (\d+)/.exec(text) ?? [])[1] ?? 0);
};

test('calorie control: macros in g/kg and %, meal split, carb cycling, food prefs, shopping, trend', async ({ page }) => {
  test.setTimeout(120_000);
  await openDiet(page);
  const kcalField = page.getByLabel('اكتب السعرات');
  const kcal = Number(await kcalField.inputValue());

  // 1. Own macros: protein g/kg + fat %, carbs take the rest; calories stay.
  await page.getByLabel('أحدد الماكروز بنفسي').check();
  const proteinField = page.getByRole('textbox', { name: 'قيمة بروتين' });
  const p0 = Number(await proteinField.inputValue());
  await page.getByRole('button', { name: 'زوّد بروتين' }).click();
  await expect.poll(async () => Number(await proteinField.inputValue())).toBeCloseTo(p0 + 0.1, 5);
  await page.getByRole('group', { name: 'وحدة دهون' }).getByRole('button', { name: '%' }).click();
  await expect(page.getByRole('group', { name: 'وحدة دهون' }).getByRole('button', { name: '%' })).toHaveAttribute('aria-pressed', 'true');
  await expect(kcalField).toHaveValue(String(kcal));
  await expect(page.getByText(/كارب: الباقي من السعرات/)).toBeVisible();
  // Very low fat → friendly warning.
  const fatField = page.getByRole('textbox', { name: 'قيمة دهون' });
  await fatField.fill('8');
  await fatField.press('Enter');
  await expect(page.getByText(/الدهون أقل من/)).toBeVisible();
  await fatField.fill('25');
  await fatField.press('Enter');
  await page.screenshot({ path: `${SHOTS}/cal-macros.png` });

  // 2. Meal split: big breakfast preset, then a manual + keeps the day at 100 %.
  await page.getByText('توزيع السعرات على الوجبات').click();
  const b0 = await mealTarget(page, 'فطار');
  await page.getByRole('group', { name: 'شكل التوزيع' }).getByRole('button', { name: 'فطار كبير' }).click();
  await expect.poll(() => mealTarget(page, 'فطار')).toBeGreaterThan(b0);
  await page.getByRole('button', { name: 'زوّد نسبة غدا' }).click();
  await expect(page.getByText('المجموع 100%')).toBeVisible();
  await expect(page.getByRole('group', { name: 'شكل التوزيع' }).getByRole('button', { name: 'بإيدك' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('العميل بيتمرن في ميعاد ثابت').check();
  await expect(page.getByText('بعد التمرين').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/cal-split.png` });

  // 3. Carb cycling: training days eat more, weekly average on target.
  await page.getByText('أيام تمرين وأيام راحة', { exact: true }).click();
  await page.getByLabel(/كارب سايكلنج/).check();
  const day1 = page.getByRole('button', { name: 'يوم 1: تمرين' });
  const day2 = page.getByRole('button', { name: 'يوم 2: راحة' });
  await expect(day1).toBeVisible();
  const k1 = Number((await day1.locator('small').first().innerText()).replace(/\D/g, ''));
  const k2 = Number((await day2.locator('small').first().innerText()).replace(/\D/g, ''));
  expect(k1).toBeGreaterThan(k2);
  await expect(page.getByText(/متوسط الأسبوع \d+ سعر · الهدف \d+/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/cal-cycle.png` });

  // 4. Food prefs: egg allergy removes egg dishes from the week.
  await page.getByRole('button', { name: 'الممنوعات والمفضّل' }).click();
  const sheet = page.getByRole('dialog', { name: 'أكل العميل' });
  await sheet.getByRole('button', { name: 'بيض', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'بيض', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: /زوّد أكلة/ }).last().click();
  const picker = page.getByRole('dialog', { name: /أكل بيحبه/ });
  await picker.getByRole('searchbox').fill('تونة');
  await picker.getByRole('button', { name: /تونة/ }).first().click();
  await expect(sheet.getByRole('button', { name: /شيل تونة/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/cal-prefs.png` });
  await sheet.getByRole('button', { name: 'إغلاق' }).first().click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/وصفة اتشالت/)).toBeVisible();
  for (let d = 1; d <= 7; d++) {
    await page.getByRole('tab', { name: new RegExp(`يوم ${d}`) }).click();
    const names = await page.locator('[class*="lineName"]').allInnerTexts();
    expect(names.filter((n) => /^(بيض|بياض بيض|صفار بيض)/.test(n))).toEqual([]);
  }

  // 5. Day bars and the shopping list.
  await expect(page.getByRole('group', { name: 'اليوم بالأرقام' })).toBeVisible();
  await expect(page.getByText(/\d+ من \d+ جم/).first()).toBeVisible();
  await page.getByRole('button', { name: 'قائمة المشتريات' }).click();
  const shop = page.getByRole('dialog', { name: 'مشتريات الأسبوع بالجرام' });
  await expect(shop.getByText(/\d+ جم|كجم/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/cal-shopping.png` });
  await page.keyboard.press('Escape');

  // 6. Trend card is there (one tap applies a suggestion when the weigh-ins call for it).
  await expect(page.getByRole('group', { name: 'الوزن والسعرات' })).toBeVisible();

  // Choices are kept for the client.
  await page.reload();
  await expect(page.getByLabel('أحدد الماكروز بنفسي')).toBeChecked();
  await expect(page.getByText(/وصفة اتشالت/)).toBeVisible();

  // Save stays compatible: gram lines on the meal plan.
  await page.getByRole('button', { name: 'احفظ كخطة للعميل' }).click();
  await expect(page.getByText(/اتحفظ 7 أيام/)).toBeVisible();
  await expect(page.getByText(/\d+ جم · \d+ سعر/).first()).toBeVisible();
});

for (const [w, h] of [
  [412, 915],
  [375, 667],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`calorie control screens ${w}x${h} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openDiet(page);
      await page.getByLabel('أحدد الماكروز بنفسي').check();
      await page.getByText('توزيع السعرات على الوجبات').click();
      await page.getByLabel('العميل بيتمرن في ميعاد ثابت').check();
      await page.getByText('أيام تمرين وأيام راحة', { exact: true }).click();
      await page.getByLabel(/كارب سايكلنج/).check();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(w);
      await page.getByLabel('أحدد الماكروز بنفسي').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/ar-${w}-${scheme}-macros.png` });
      await page.getByText('توزيع السعرات على الوجبات').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/ar-${w}-${scheme}-split.png` });
      await page.getByRole('group', { name: 'اليوم بالأرقام' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/ar-${w}-${scheme}-day.png` });
    });
  }
}

test('calorie control in English', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openDiet(page);
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.reload();
  await expect(page.getByText('Set macros myself')).toBeVisible();
  await page.getByLabel('Set macros myself').check();
  await page.getByText('Calories per meal').click();
  await page.getByText('Training and rest days', { exact: true }).click();
  await page.getByLabel(/Carb cycling/).check();
  await expect(page.getByText(/Weekly average \d+ kcal/)).toBeVisible();
  await page.getByText('Set macros myself').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/en-412-macros.png` });
  await page.getByText('Calories per meal').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/en-412-split.png` });
  await page.getByRole('button', { name: 'Shopping list' }).click();
  await expect(page.getByRole('dialog', { name: 'Week shopping in grams' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/en-412-shopping.png` });
});

test('goal planner: target weight + weeks → calories and protein, what-if sliders, safety fixes, meal options', async ({ page }) => {
  test.setTimeout(120_000);
  await openDiet(page);
  await page.getByLabel('احسب السعرات من الوزن المطلوب والمدة').check();
  const summary = page.getByText(/^هتاخد \d+ سعر و\d+ جم بروتين في اليوم، وتوصل [\d.]+ كجم يوم/);
  await expect(summary).toBeVisible();
  const kcalNow = async () => Number((/هتاخد (\d+)/.exec(await summary.innerText()) ?? [])[1] ?? 0);
  await expect(page.getByText(/بروتين [\d.]+ جم\/كجم .* لأنه بينشّف|بروتين [\d.]+ جم\/كجم/).first()).toBeVisible();
  // Fewer weeks for the same target → bigger deficit → fewer calories; the targets follow.
  const k0 = await kcalNow();
  await page.getByLabel('المدة', { exact: true }).fill('6');
  await expect.poll(kcalNow).toBeLessThan(k0);
  await expect(page.getByLabel('اكتب السعرات')).toHaveValue(String(await kcalNow()));
  // A far target in 6 weeks is unsafe: flags and one-tap fixes.
  const targetSlider = page.getByLabel('الوزن المطلوب', { exact: true });
  await targetSlider.fill((await targetSlider.getAttribute('min')) ?? '40');
  await expect(page.getByText(/النزول أسرع من/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/goal-flags.png` });
  await page.getByRole('button', { name: /مدة واقعية/ }).click();
  await expect(page.getByText(/النزول أسرع من/)).toHaveCount(0);
  // Protein slider overrides; reset returns to the personal value.
  await page.getByLabel('البروتين', { exact: true }).fill('3');
  await expect(page.getByText('البروتين متغيّر بإيدك.')).toBeVisible();
  await page.getByRole('button', { name: 'رجّع البروتين المحسوب' }).click();
  await expect(page.getByText('البروتين متغيّر بإيدك.')).toHaveCount(0);
  await page.getByText('مخطط الهدف').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/goal-panel.png` });

  // Meal options: pick the second way to eat lunch.
  const lunch = page.getByRole('region', { name: 'غدا' }).first();
  const choices = lunch.getByRole('group', { name: 'اختيارات للوجبة' });
  await expect(choices.getByRole('button').nth(1)).toBeVisible();
  const second = (await choices.getByRole('button').nth(1).innerText()).split(' · ')[0] ?? '';
  await choices.getByRole('button').nth(1).click();
  await expect(choices.getByRole('button').first()).toContainText(second);
  await lunch.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/goal-options.png` });
  await page.getByRole('button', { name: 'احفظ كخطة للعميل' }).click();
  await expect(page.getByText(/اتحفظ 7 أيام/)).toBeVisible();
});

for (const [w, h, scheme, lang] of [
  [412, 915, 'light', 'ar'],
  [375, 667, 'dark', 'ar'],
  [412, 915, 'dark', 'en'],
  [375, 667, 'light', 'en'],
] as const) {
  test(`goal planner screen ${w}x${h} ${scheme} ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: scheme });
    await openDiet(page);
    if (lang === 'en') {
      await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
      await page.reload();
      await page.getByLabel('Set calories from target weight and duration').check();
      await expect(page.getByText(/You’ll eat \d+ kcal/)).toBeVisible();
    } else {
      await page.getByLabel('احسب السعرات من الوزن المطلوب والمدة').check();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    await page.getByRole('region', { name: lang === 'en' ? 'Goal planner' : 'مخطط الهدف' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/goal-${lang}-${w}-${scheme}.png` });
    await page.getByText(lang === 'en' ? /You’ll eat/ : /^هتاخد/).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/goal-${lang}-${w}-${scheme}-2.png` });
  });
}
