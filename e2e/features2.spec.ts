import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

async function openSara(page: Page) {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'سارة محمود' })).toBeVisible();
}

test('food table: search, add a custom food', async ({ page }) => {
  await openApp(page);
  await page.goto('/more/foods?standalone=1');
  await expect(page.getByRole('heading', { level: 1, name: 'جدول الأكل' })).toBeVisible();
  await page.getByLabel('دوّر على صنف').fill('طعمية');
  await expect(page.getByRole('button', { name: /^طعمية/ })).toBeVisible();
  await page.getByRole('button', { name: 'صنف جديد' }).click();
  const d = page.getByRole('dialog', { name: 'صنف جديد' });
  await d.getByLabel('الاسم').fill('شوفان بالتمر');
  await d.getByLabel('سعرات / 100 جم').fill('380');
  await d.getByLabel('بروتين جم / 100 جم').fill('11');
  await d.getByLabel('كارب جم / 100 جم').fill('66');
  await d.getByLabel('دهون جم / 100 جم').fill('7');
  await d.getByRole('button', { name: 'حفظ' }).click();
  await page.getByLabel('دوّر على صنف').fill('شوفان بالتمر');
  await expect(page.getByRole('button', { name: /^شوفان بالتمر/ })).toBeVisible();
});

test('recipe editor: pick from the food table and macros follow the grams', async ({ page }) => {
  await openApp(page);
  await page.goto('/more/recipes?standalone=1');
  await page.getByRole('button', { name: 'وصفة جديدة' }).click();
  const d = page.getByRole('dialog', { name: 'وصفة جديدة' });
  await d.getByLabel('اسم الوصفة').fill('صدور مشوية');
  await d.getByRole('button', { name: 'من جدول الأكل' }).click();
  const picker = page.getByRole('dialog', { name: 'اختار صنف' });
  await picker.getByLabel('دوّر على صنف').fill('صدر فراخ');
  await picker.getByRole('button', { name: /صدر فراخ/ }).first().click();
  await d.getByLabel('الكمية').first().fill('200');
  await expect(d.getByText(/الحصة الواحدة/)).toContainText(/\d/);
  await d.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('button', { name: /^صدور مشوية/ })).toBeVisible();
});

test('meal plan: scale to target and shopping list', async ({ page }) => {
  await openSara(page);
  await page.getByRole('link', { name: /السعرات والماكروز/ }).click();
  await page.getByLabel('السن').fill('30');
  await page.getByRole('button', { name: 'حفظ للعميل' }).click();
  await page.getByRole('link', { name: 'الوجبات' }).click();
  await page.getByRole('button', { name: /ابدأ أول يوم/ }).click();
  await page.getByRole('button', { name: 'إضافة صنف' }).first().click();
  await page.getByRole('dialog').last().getByRole('button').filter({ hasText: /فول/ }).first().click();
  await page.getByRole('button', { name: 'اظبط الكميات على الهدف' }).click();
  await expect(page.getByText(/الكميات اتظبطت/)).toBeVisible();
  await page.getByRole('button', { name: 'قائمة المشتريات' }).click();
  await expect(page.getByRole('dialog', { name: 'قائمة المشتريات' }).getByText(/فول/).first()).toBeVisible();
});

test('exercise detail shows alternatives', async ({ page }) => {
  await openApp(page);
  await page.goto('/exercises?standalone=1');
  await page.getByRole('searchbox').first().fill('بنش');
  await page.locator('a[href^="/exercises/"]').first().click();
  await expect(page.getByRole('heading', { name: 'تمارين بديلة' })).toBeVisible();
});

test('outbox screen opens with its settings', async ({ page }) => {
  await openApp(page);
  await page.goto('/more/outbox?standalone=1');
  await expect(page.getByRole('heading', { level: 1, name: 'رسايل النهارده' })).toBeVisible();
  await page.getByRole('button', { name: 'أنواع الرسايل' }).click();
  await expect(page.getByRole('checkbox', { name: 'عيد ميلاد' })).toBeChecked();
});

test('3D viewer has front/side/back buttons', async ({ page }) => {
  await openApp(page);
  await page.goto('/more/muscle-map?view=3d&standalone=1');
  await page.getByRole('button', { name: 'جنب' }).click();
  await expect(page.getByRole('button', { name: 'جنب' })).toHaveAttribute('aria-pressed', 'true');
});
