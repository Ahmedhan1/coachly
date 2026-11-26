import { expect, test } from '@playwright/test';
import { enterAsGuest } from './helpers';

const rootVar = (name: string) => `getComputedStyle(document.documentElement).getPropertyValue('${name}').trim().toUpperCase()`;

test('first-run identity setup: name, brand color with live preview, currency; editable later in settings', async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.getByText('خطوة 1 من 4')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'اسمك إيه؟' })).toBeVisible();
  await page.getByLabel('اسمك زي ما تحب العملاء يشوفوه').fill('كابتن تامر');
  await page.getByRole('button', { name: 'التالي' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'اللوجو بتاعك' })).toBeVisible();
  await page.getByRole('button', { name: 'التالي' }).click(); // logo is optional

  await expect(page.getByRole('heading', { level: 1, name: 'لون الهوية' })).toBeVisible();
  expect(await page.evaluate(rootVar('--brand'))).toBe('#F25C1F');
  await page.getByRole('radio', { name: 'أحمر' }).check({ force: true });
  // live preview: the whole screen follows, and text on the brand flips to white for crimson
  await expect.poll(() => page.evaluate(rootVar('--brand'))).toBe('#C81E3A');
  expect(await page.evaluate(rootVar('--brand-on'))).toBe('#FFFFFF');
  // custom hex
  const hex = page.getByLabel('لون تاني (كود Hex)');
  await hex.fill('#1d5fd1');
  await expect.poll(() => page.evaluate(rootVar('--brand'))).toBe('#1D5FD1');
  await hex.fill('#zz');
  await hex.fill('#12345g');
  await expect(page.getByText('اكتب اللون كده: #F25C1F')).toBeVisible();
  await page.getByRole('radio', { name: 'أحمر' }).check({ force: true });
  await page.getByRole('button', { name: 'التالي' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'العملة والوحدات' })).toBeVisible();
  await page.getByLabel('العملة', { exact: true }).selectOption('SAR');
  await page.getByRole('button', { name: 'يلا نبدأ' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'النهارده' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'المزيد والإعدادات' })).toHaveText('ك');
  expect(await page.evaluate(rootVar('--brand'))).toBe('#C81E3A');

  // survives a reload, and setup does not show again
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'النهارده' })).toBeVisible();
  await expect.poll(() => page.evaluate(rootVar('--brand'))).toBe('#C81E3A');

  // editable later from settings
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /الإعدادات/ }).click();
  await page.getByRole('link', { name: /الهوية/ }).click();
  await expect(page.getByLabel('اسمك زي ما تحب العملاء يشوفوه')).toHaveValue('كابتن تامر');
  await expect(page.getByLabel('العملة', { exact: true })).toHaveValue('SAR');
  await page.getByLabel('اسمك زي ما تحب العملاء يشوفوه').fill('كابتن تامر سعيد');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('اتحفظت الهوية')).toBeVisible();
});

test('identity setup can be skipped entirely', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'بعدين' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'النهارده' })).toBeVisible();
  expect(await page.evaluate(rootVar('--brand'))).toBe('#F25C1F');
});
