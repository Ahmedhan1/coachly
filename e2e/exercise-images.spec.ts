import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/** Set QA_SHOTS=<dir> to save screenshots of the library, a photo exercise and a no-photo exercise. */
const shot = process.env.QA_SHOTS;

/** Every <img> on screen that has loaded must have real pixels (no broken image icons). */
async function expectNoBrokenImages(page: Page): Promise<void> {
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.getBoundingClientRect().width > 0 && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src),
  );
  expect(broken).toEqual([]);
}

for (const [label, size] of [
  ['android', { width: 412, height: 915 }],
  ['iphone-se', { width: 375, height: 667 }],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`exercise images ${label} ${scheme}`, () => {
      test.use({ viewport: size, colorScheme: scheme });

      test('library thumbnails, photo carousel and the labelled illustration fallback', async ({ page }) => {
        test.setTimeout(90_000);
        await openApp(page, '/exercises');
        const list = page.getByRole('list', { name: 'التمارين' });
        await expect(list.getByRole('listitem').first()).toBeVisible();
        await expect(list.locator('img').first()).toBeVisible();
        await page.waitForTimeout(800);
        await expectNoBrokenImages(page);
        if (shot) await page.screenshot({ path: `${shot}/lib-${label}-${scheme}.png` });

        // A photo exercise: the start photo fills the frame.
        await page.goto('/exercises/Barbell_Hip_Thrust?standalone=1');
        const photo = page.getByRole('group', { name: /صورة 1 من/ }).locator('img').first();
        await expect(photo).toBeVisible({ timeout: 20_000 });
        await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);
        if (shot) await page.screenshot({ path: `${shot}/detail-photo-${label}-${scheme}.png` });

        // An exercise added in wave 5 with no photo: the muscle picture, never an empty box.
        await page.goto('/exercises/pt_Spanish_Squat?standalone=1');
        await expect(page.getByRole('heading', { level: 1, name: 'سبانيش سكوات' })).toBeVisible({ timeout: 20_000 });
        const picture = page.locator('img[alt^="رسمة العضلات"], svg[aria-label]').first();
        await expect(picture).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('العضلات المستهدفة', { exact: true }).first()).toBeVisible();
        await expectNoBrokenImages(page);
        if (shot) await page.screenshot({ path: `${shot}/detail-nophoto-${label}-${scheme}.png` });

        // No-photo rows in the list show the muscle picture as their thumbnail.
        await page.goto('/exercises?standalone=1');
        await page.getByRole('searchbox').or(page.getByPlaceholder(/اسم التمرين/)).first().fill('تي آر إكس');
        await expect(list.getByRole('listitem').first()).toBeVisible();
        await page.waitForTimeout(1500);
        await expectNoBrokenImages(page);
        if (shot) await page.screenshot({ path: `${shot}/lib-nophoto-${label}-${scheme}.png` });
      });
    });
  }
}

test('an extra now reuses the matching dataset photos (imagesFrom)', async ({ page }) => {
  await openApp(page, '/exercises/pt_Bicycle_Crunch');
  const photo = page.getByRole('group', { name: /صورة 1 من/ }).locator('img').first();
  await expect(photo).toBeVisible({ timeout: 20_000 });
  await expect(photo).toHaveAttribute('src', /Air_Bike-0\.webp/);
});

test('no-photo and drawing exercises in the program picker, builder, session and PDF', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  const clientId = page.url().split('/clients/')[1]?.split(/[/?]/)[0] ?? '';
  await page.getByRole('link', { name: /البرنامج/ }).first().click();
  await page.getByRole('button', { name: /فول بادي/ }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();

  for (const [query, name] of [
    ['سبانيش', 'سبانيش سكوات'],
    ['جلوت بريدج هولد', 'جلوت بريدج هولد'],
  ] as const) {
    await page.getByRole('button', { name: 'ضيف تمرين' }).first().click();
    const picker = page.getByRole('dialog', { name: 'ضيف تمرين' });
    await picker.getByRole('searchbox').or(picker.getByRole('textbox')).first().fill(query);
    const row = picker.getByText(name, { exact: true }).first();
    await expect(row).toBeVisible();
    await page.waitForTimeout(1200);
    await expectNoBrokenImages(page);
    if (shot) await page.screenshot({ path: `${shot}/picker-${query === 'سبانيش' ? 'nophoto' : 'drawing'}.png` });
    await row.click();
    const done = picker.getByRole('button', { name: /ضيف|تم|خلاص/ }).last();
    if (await picker.isVisible()) await done.click();
    await expect(page.getByTestId('exercise-card').filter({ hasText: name })).toBeVisible();
  }
  const added = page.getByTestId('exercise-card').filter({ hasText: 'سبانيش سكوات' });
  await added.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await expectNoBrokenImages(page);
  if (shot) await page.screenshot({ path: `${shot}/builder-nophoto.png` });

  await page.getByRole('button', { name: 'خيارات البرنامج' }).click();
  await page.getByRole('button', { name: 'ابدأ حصة باليوم ده' }).click();
  await expect(page.getByRole('button', { name: 'خلّصت السيت' })).toBeVisible();
  // Skip the template exercises so the no-photo one becomes the current exercise card.
  for (let i = 0; i < 6; i++) {
    const before = await page.getByText(/^تمرين \d+ من \d+$/).first().textContent();
    await page.getByRole('button', { name: /تخطّي|تخطي/ }).first().click();
    await expect.poll(() => page.getByText(/^تمرين \d+ من \d+$/).first().textContent()).not.toBe(before);
  }
  await expect(page.getByRole('heading', { name: 'سبانيش سكوات' }).first()).toBeVisible();
  await page.getByRole('heading', { name: 'سبانيش سكوات' }).first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  await expectNoBrokenImages(page);
  if (shot) await page.screenshot({ path: `${shot}/session-nophoto.png` });

  await page.goto(`/more/pdf?client=${clientId}&standalone=1`);
  await page.getByLabel('نوع الملف').selectOption({ label: 'برنامج كامل' });
  for (const name of ['الغلاف', 'جدول التمارين']) {
    const box = page.getByRole('checkbox', { name, exact: true });
    if ((await box.isChecked()) !== (name === 'جدول التمارين')) await box.click();
  }
  await page.getByRole('button', { name: 'اعمل الملف' }).click();
  await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 120_000 });
  if (shot) await page.screenshot({ path: `${shot}/pdf-screen.png`, fullPage: true });
  const pages = page.getByRole('img', { name: /^صفحة \d+$/ });
  const count = await pages.count();
  for (let i = 0; i < count && shot; i++) {
    await pages.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await pages.nth(i).screenshot({ path: `${shot}/pdf-page-${i + 1}.png` });
  }
});
