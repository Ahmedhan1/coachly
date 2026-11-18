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
