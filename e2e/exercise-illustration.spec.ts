import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/** Optional: set QA_SHOTS=<dir> to also save screenshots there. */
const shot = process.env.QA_SHOTS;

test.describe('exercise illustrations and detail extras', () => {
  test('exercise without a photo: the list thumbnail and the detail show our own muscle picture, cues and clients', async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page, '/exercises');
    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/اسم التمرين/)).first();
    await search.fill('فروج بامب');
    const list = page.getByRole('list', { name: 'التمارين' });
    const row = list.getByRole('listitem').first();
    await expect(row).toContainText('فروج بامب');
    await expect(row.locator('img[alt^="رسمة العضلات"]')).toBeVisible({ timeout: 30_000 });
    if (shot) await page.screenshot({ path: `${shot}/ex-library-nophoto.png` });

    await row.getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'فروج بامب' })).toBeVisible();
    await expect(page.locator('img[alt^="رسمة العضلات"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('نصايح الأداء')).toBeVisible();
    await expect(page.getByText('اعصر الجلوتس').first()).toBeVisible();
    if (shot) await page.screenshot({ path: `${shot}/ex-detail-nophoto.png`, fullPage: true });
  });

  test('exercise with library photos: photos first, our muscle picture as the last slide', async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page, '/exercises/Barbell_Bench_Press_-_Medium_Grip');
    await expect(page.getByRole('heading', { level: 1, name: 'بنش برس بالبار' })).toBeVisible();
    const slides = page.getByRole('group', { name: /^صورة \d+ من 3$/ });
    await expect(slides.first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'رسمة العضلات' }).locator('img[alt^="رسمة العضلات"]')).toBeAttached({ timeout: 30_000 });
    await expect(page.getByText('بنش برس بالبار').first()).toBeVisible();
    if (shot) {
      await page.screenshot({ path: `${shot}/ex-detail-photo.png`, fullPage: true });
      await page.getByRole('group', { name: 'رسمة العضلات' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shot}/ex-detail-photo-picture.png` });
    }
  });

  test('library keeps working with no WebGL (flat muscle map stays)', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await openApp(page, '/exercises/pt_Frog_Pump');
    await expect(page.getByRole('heading', { level: 1, name: 'فروج بامب' })).toBeVisible();
    await expect(page.getByRole('img', { name: /مفيش صورة/ }).first()).toBeVisible();
  });
});
