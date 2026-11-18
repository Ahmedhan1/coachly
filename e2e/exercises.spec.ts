import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('exercise library', () => {
  test('filters by muscle, favourites, renames and keeps the list windowed', async ({ page }) => {
    await openApp(page, '/exercises');
    const list = page.getByRole('list', { name: 'التمارين' });
    await expect(list.getByRole('listitem').first()).toBeVisible();
    // 1000+ exercises, but only the rows near the viewport are in the DOM.
    expect(await list.getByRole('listitem').count()).toBeLessThan(40);
    await expect(list.getByRole('listitem').first()).toHaveAttribute('aria-setsize', /^1\d{3}$/);

    // Muscle filter through the sheet.
    await page.getByRole('button', { name: 'الفلاتر' }).click();
    const sheet = page.getByRole('dialog', { name: 'الفلاتر' });
    await sheet.getByRole('button', { name: 'جلوتس', exact: true }).click();
    await sheet.getByRole('button', { name: /اعرض \d+ تمرين/ }).click();
    await expect(page.getByRole('button', { name: 'شيل فلتر جلوتس' })).toBeVisible();
    const first = list.getByRole('listitem').first();
    await expect(first.getByText('جلوتس').first()).toBeVisible();

    // Favourite the first one, then show favourites only.
    await first.getByRole('button', { name: /^ضيف .* للمفضلة$/ }).click();
    await page.getByRole('button', { name: 'شيل فلتر جلوتس' }).click();
    await page.getByRole('button', { name: 'المفضلة', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);

    // Rename it (trainer override) and see the new name in the library.
    await list.getByRole('listitem').first().getByRole('link').click();
    await page.getByRole('button', { name: 'غيّر الاسم' }).click();
    const rename = page.getByRole('dialog', { name: 'اسم التمرين' });
    await rename.getByLabel('الاسم اللي هيظهر للعميل').fill('هيب ثرست بتاعي');
    await rename.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'هيب ثرست بتاعي' })).toBeVisible();
    await page.goBack();
    await expect(list.getByRole('link', { name: /هيب ثرست بتاعي/ })).toBeVisible();
  });

  test('offline photos sheet downloads with progress', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page, '/exercises');
    await page.getByRole('button', { name: 'صور التمارين بدون نت' }).click();
    const sheet = page.getByRole('dialog', { name: 'صور التمارين بدون نت' });
    await sheet.getByRole('button', { name: /نزّل كل صور التمارين|كمّل التنزيل/ }).click();
    await expect(sheet.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /^[1-9]\d*$/, { timeout: 30_000 });
    await expect(sheet.getByText('كل الصور على الموبايل')).toBeVisible({ timeout: 100_000 });
  });

  test('3D model: tap on the chest selects تشيست and opens its exercises', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, '/more/muscle-map?view=3d');
    const canvas = page.locator('[data-testid=viewer-3d][data-state=ready] canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'ورا' })).toBeInViewport();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    // Sternum line: the ring of rays picks the chest, not the lats behind the gap. Under load the first frames
    // can still be framing the model, so the first tap is repeated until the camera has settled.
    await expect(async () => {
      await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.27);
      await expect(page.getByText('اخترت تشيست')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    // The abs used to sit under the obliques' sheath in the source model: they must be tappable.
    await page.touchscreen.tap(box.x + box.width * 0.52, box.y + box.height * 0.4);
    await expect(page.getByText('اخترت أبس')).toBeVisible();
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.27);
    await expect(page.getByText('اخترت تشيست')).toBeVisible();
    await page.getByRole('button', { name: 'افتح تمارين تشيست' }).click();
    await expect(page.getByRole('button', { name: 'شيل فلتر تشيست' })).toBeVisible();
  });
});
