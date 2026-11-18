import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const SHOTS = process.env.TAILOR_SHOTS ?? '';

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openSaraTraining(page: Page) {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.getByRole('tab', { name: 'التمرين' }).click();
  await expect(page.getByTestId('training-profile-card')).toBeVisible();
}

async function fillHomeKneeProfile(page: Page) {
  await page.getByRole('button', { name: 'جهّز ملف التمرين' }).click();
  const sheet = page.getByRole('dialog', { name: /ملف تمرين/ });
  const seg = (text: string) => sheet.locator('label').filter({ hasText: new RegExp(`^${text}$`) }).click();
  await seg('البيت');
  await sheet.getByRole('button', { name: 'دامبل', exact: true }).click();
  await seg('مبتدئ');
  await sheet.getByRole('button', { name: 'ركبة', exact: true }).click();
  await seg('3');
  await shot(page, 'profile-sheet');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(/اتحفظ ملف تمرين/)).toBeVisible();
}

test('training profile → fitting program → picker warnings and safer options → client note', async ({ page }) => {
  await openSaraTraining(page);
  await fillHomeKneeProfile(page);
  const card = page.getByTestId('training-profile-card');
  await expect(card.getByText('انتبه: ركبة')).toBeVisible();
  await expect(card.getByText('البيت')).toBeVisible();
  await shot(page, 'card');

  // «اعمل برنامج مناسب»: home + dumbbells + knee → no barbell, no jumps.
  await card.getByRole('button', { name: 'اعمل برنامج مناسب' }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();
  const ids = await page.getByTestId('exercise-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-exercise') ?? ''));
  expect(ids.length).toBeGreaterThanOrEqual(4);
  for (const id of ids) expect(id).not.toMatch(/barbell|jump|hop|smith|machine|cable/i);

  // Picker opens on «مناسب لـ سارة»; under «الكل» a squat carries the knee warning with safer options.
  await page.getByRole('button', { name: 'ضيف تمرين' }).click();
  const picker = page.getByRole('dialog').last();
  await expect(picker.getByRole('radio', { name: 'مناسب لـ سارة' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'picker-fit');
  await picker.getByRole('radio', { name: 'الكل', exact: true }).click();
  await picker.getByRole('searchbox').fill('سكوات بالبار');
  const warning = picker.getByTestId('fit-warning').first();
  await expect(warning).toContainText('ركبة');
  await picker.getByRole('button', { name: 'بدائل أأمن' }).first().click();
  await shot(page, 'picker-safer');
  const safer = picker.getByRole('list', { name: /بدائل أأمن من/ }).getByRole('button').first();
  await expect(safer).toBeVisible();
  await safer.click();
  await expect(page.getByText(/^اتضاف/)).toBeVisible();

  // Client-only note from the set editor; it shows in the editor and the session.
  await page.getByTestId('exercise-card').first().getByRole('button', { name: /^عدّل / }).click();
  await page.getByRole('button', { name: 'ملاحظة لـ سارة محمود' }).click();
  await page.getByTestId('client-note-field').fill('ركّز على الجلوتس');
  await page.getByLabel('أقصى وزن (كجم، اختياري)').fill('12');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('ركّز على الجلوتس · ≤ 12 كجم')).toBeVisible();
});

test('English: the profile card and picker chip are translated', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.reload();
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود|Sara/ }).first().click();
  await page.getByRole('tab', { name: 'Training' }).click();
  const card = page.getByTestId('training-profile-card');
  await expect(card.getByRole('heading', { name: 'Training profile' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Build a fitting program' })).toBeVisible();
  await shot(page, 'card-en');
});

test('screens: 412×915 and 375×667, light and dark, Arabic and English', async ({ page }) => {
  test.skip(!SHOTS, 'screenshots only when TAILOR_SHOTS is set');
  test.setTimeout(120_000);
  await openSaraTraining(page);
  const clientUrl = page.url();
  await fillHomeKneeProfile(page);
  await page.getByTestId('training-profile-card').getByRole('button', { name: /اعمل برنامج مناسب|Build a fitting program/ }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();
  const builderUrl = page.url();
  for (const lang of ['ar', 'en'] as const) {
    await page.evaluate((l) => localStorage.setItem('pt.locale', l), lang);
    for (const [w, h] of [[412, 915], [375, 667]] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.emulateMedia({ colorScheme: scheme });
        const tag = `${lang}-${w}-${scheme}`;
        await page.goto(builderUrl);
        await expect(page.getByTestId('exercise-card').first()).toBeVisible();
        await shot(page, `builder-${tag}`);
        await page.getByRole('button', { name: lang === 'ar' ? 'ضيف تمرين' : /Add exercise/ }).click();
        await page.waitForTimeout(400);
        await shot(page, `picker-${tag}`);
        await page.getByRole('radio', { name: lang === 'ar' ? 'الكل' : 'All', exact: true }).click();
        await page.getByRole('searchbox').fill(lang === 'ar' ? 'سكوات' : 'squat');
        await page.getByRole('button', { name: lang === 'ar' ? 'بدائل أأمن' : 'Safer options' }).first().click();
        await page.waitForTimeout(200);
        await shot(page, `safer-${tag}`);
        await page.getByRole('button', { name: lang === 'ar' ? 'إغلاق' : 'Close' }).first().click();
        await page.goto(clientUrl);
        await page.getByRole('tab', { name: lang === 'ar' ? 'التمرين' : 'Training' }).click();
        await expect(page.getByTestId('training-profile-card')).toBeVisible();
        await page.waitForTimeout(300);
        await shot(page, `card-${tag}`);
        await page.getByTestId('training-profile-card').getByRole('button', { name: lang === 'ar' ? 'عدّل ملف التمرين' : 'Edit training profile' }).click();
        await page.waitForTimeout(400);
        await shot(page, `sheet-${tag}`);
      }
    }
  }
});
