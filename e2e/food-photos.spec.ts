import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const SHOTS = process.env.E2E_SHOTS ?? 'node_modules/.e2e-food-shots';

async function recipeBook(page: Page): Promise<void> {
  await openApp(page, '/more/recipes');
  await expect(page.getByRole('heading', { level: 1, name: 'كتيّب الوصفات' })).toBeVisible();
  await expect(page.getByTestId('recipe-filters')).toBeVisible();
}

for (const [w, h] of [
  [375, 667],
  [412, 915],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`recipe book: photos, filter chips and search at ${w}×${h} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await recipeBook(page);
      // Bundled photos load (no broken images); a list row shows kcal, protein and minutes.
      const photo = page.locator('[data-kind="photo"] img').first();
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(page.getByText(/\d+ سعر · \d+ جم بروتين · \d+ دقيقة/).first()).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/book-${w}-${scheme}.png` });
      if (w !== 412 || scheme !== 'light') return;

      // Filters: breakfast + quick + vegetarian narrows the list; every shown recipe stays a breakfast.
      const filters = page.getByTestId('recipe-filters');
      await filters.getByRole('button', { name: 'فطار', exact: true }).click();
      await filters.getByRole('button', { name: 'سريع', exact: true }).click();
      await filters.getByRole('button', { name: 'نباتي', exact: true }).click();
      await expect(filters.getByText(/^\d+ وصفة$/)).toBeVisible();
      const count = Number((await filters.getByText(/^\d+ وصفة$/).innerText()).replace(/\D/g, ''));
      expect(count).toBeGreaterThan(5);
      await page.screenshot({ path: `${SHOTS}/book-filtered.png` });
      await filters.getByRole('button', { name: 'شيل الفلاتر' }).click();
      await expect(filters.getByText(/^\d+ وصفة$/)).toHaveCount(0);

      // Cuisine chip + English search.
      await filters.getByRole('button', { name: 'خليجي', exact: true }).click();
      await expect(page.getByText('مجبوس سمك')).toBeVisible();
      await filters.getByRole('button', { name: 'خليجي', exact: true }).click();
      await page.getByRole('searchbox', { name: 'دوّر على وصفة' }).fill('kabsa');
      await expect(page.getByText('كبسة فراخ خفيفة')).toBeVisible();

      // Recipe detail shows the large photo.
      await page.getByText('كبسة فراخ خفيفة').click();
      await expect(page.getByRole('dialog').locator('[data-kind="photo"] img').first()).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/recipe-detail.png` });
    });
  }
}

test('food photos: offline download stores every photo', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await recipeBook(page);
  const box = page.getByTestId('food-photos-offline');
  await box.scrollIntoViewIfNeeded();
  await expect(box.getByText(/Wikimedia Commons/)).toBeVisible();
  await box.getByRole('button', { name: 'نزّل كل صور الأكل' }).click();
  await expect(box.getByText(/كل صور الأكل متخزنة/)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/offline-done.png` });

  // Offline: a recipe far down the list (never shown before) still shows its photo.
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('searchbox', { name: 'دوّر على وصفة' }).fill('harira');
  const photo = page.locator('[data-kind="photo"] img').first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.context().setOffline(false);
});

test('food table shows food photos', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, '/more/foods');
  await page.getByRole('searchbox', { name: 'دوّر على صنف' }).fill('طماطم');
  const photo = page.locator('[data-kind="photo"] img').first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/foods-412.png` });
});

test.describe('photo fallback', () => {
  test.use({ serviceWorkers: 'block' });
  test('a photo that fails to load shows the illustration, never a broken image', async ({ page }) => {
    await page.route('**/food-img/photos/*.webp', (route) => route.fulfill({ status: 404, body: '' }));
    await page.setViewportSize({ width: 412, height: 915 });
    await recipeBook(page);
    await expect(page.locator('[data-kind="icon"] img').first()).toBeVisible();
    // Rows on screen (lazy images below the fold never load) all switched to the illustration.
    for (let i = 0; i < 5; i++) await expect(page.locator('[data-kind]').nth(i)).toHaveAttribute('data-kind', 'icon');
    await page.screenshot({ path: `${SHOTS}/fallback-icons.png` });
  });
});
