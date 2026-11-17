import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/** Opens the demo client "سارة محمود" and returns its id from the URL. */
async function openSara(page: Page): Promise<string> {
  await openApp(page);
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'سارة محمود' })).toBeVisible();
  return page.url().split('/clients/')[1]!.split(/[/?]/)[0]!;
}

/** Saves a calculation and a body-fat measurement so the nutrition and progress sections have data. */
async function seedClientData(page: Page, clientId: string) {
  await page.goto(`/clients/${clientId}/nutrition?standalone=1`);
  await page.getByLabel('السن').fill('30');
  await page.getByRole('button', { name: 'حفظ للعميل' }).click();
  await expect(page.getByText(/اتحفظت سعرات/)).toBeVisible();
  await page.goto(`/clients/${clientId}/progress?standalone=1`);
  await page.getByRole('button', { name: 'قياس جديد' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'قياس جديد' });
  await sheet.getByLabel('الوزن (كجم)').fill('72');
  await sheet.getByLabel('نسبة الدهون %').fill('31');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText(/31%/).first()).toBeVisible();
}

async function generateAndDownload(page: Page): Promise<{ bytes: number; text: string }> {
  await page.getByRole('button', { name: 'اعمل الملف' }).click();
  await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 90_000 });
  // Page previews are images (an <iframe> PDF is blank on Android Chrome).
  await expect(page.getByRole('img', { name: 'صفحة 1' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'نزّل الملف' }).click();
  const file = await (await download).path();
  const buf = readFileSync(file!);
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  return { bytes: buf.length, text: (await page.getByText(/الملف جاهز/).textContent()) ?? '' };
}

test('PDF: the three presets from the real UI, previews, download', async ({ page }) => {
  test.setTimeout(240_000);
  const id = await openSara(page);
  await seedClientData(page, id);
  await page.goto(`/more/pdf?client=${id}&standalone=1`);
  for (const preset of ['برنامج كامل', 'تغذية فقط', 'تقرير تقدم شهري']) {
    await page.getByLabel('نوع الملف').selectOption({ label: preset });
    const r = await generateAndDownload(page);
    console.log(`[pdf-ui] ${preset}: ${r.bytes} bytes · ${r.text}`);
    expect(r.bytes).toBeLessThan(15 * 1024 * 1024);
    // Any change of options lets the trainer make the file again.
    await page.getByLabel(/عنوان الملف/).fill(preset);
  }
});

/** Gives the open client a ready program (فول بادي) from the client file, so the exercise sections have content. */
async function assignTemplateProgram(page: Page, clientId: string) {
  await page.goto(`/clients/${clientId}?standalone=1`);
  await page.getByRole('link', { name: /البرنامج/ }).first().click();
  await page.getByRole('button', { name: /فول بادي/ }).click();
  await expect(page.getByTestId('exercise-card').first()).toBeVisible();
}

test('PDF: every section on its own renders', async ({ page }) => {
  test.setTimeout(300_000);
  const id = await openSara(page);
  await assignTemplateProgram(page, id);
  await page.goto(`/more/pdf?client=${id}&standalone=1`);
  const names = ['الغلاف', 'بيانات العميل', 'جدول التمارين', 'السعرات والماكروز', 'خطة الوجبات', 'المكملات', 'التقدم', 'تعليمات وملاحظات'];
  for (const only of names) {
    for (const name of names) {
      const box = page.getByRole('checkbox', { name, exact: true });
      if ((await box.isChecked()) !== (name === only)) await box.click();
    }
    const muscle = page.getByRole('checkbox', { name: 'خريطة العضلات', exact: true });
    if (await muscle.isChecked()) await muscle.click();
    await page.getByLabel(/عنوان الملف/).fill(only);
    await page.getByRole('button', { name: 'اعمل الملف' }).click();
    await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 90_000 });
    console.log(`[pdf-ui] only ${only}: ${await page.getByText(/الملف جاهز/).textContent()}`);
  }
});

test('PDF: without a file share sheet (Android Chrome) the download fallback explains what happened', async ({ page }) => {
  test.setTimeout(120_000);
  // Chrome on Android often answers canShare({ files: [pdf] }) with false.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => undefined, configurable: true });
  });
  const id = await openSara(page);
  await page.goto(`/more/pdf?client=${id}&standalone=1`);
  await page.getByRole('button', { name: 'اعمل الملف' }).click();
  await expect(page.getByText(/الملف جاهز: \d+ صفحة/)).toBeVisible({ timeout: 90_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'نزّل وابعته على واتساب' }).click();
  await download;
  await expect(page.getByText('الملف اتنزّل على الموبايل')).toBeVisible();
  await expect(page.getByText(/المشبك/)).toBeVisible();
  const wa = page.getByRole('link', { name: /افتح محادثة سارة محمود على واتساب/ });
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('PDF: only the exercise table for a client without a program says why instead of failing', async ({ page }) => {
  const id = await openSara(page);
  await page.goto(`/more/pdf?client=${id}&standalone=1`);
  await expect(page.getByText('العميل ده ما عندوش برنامج، قسم التمارين هيتشال.').first()).toBeVisible();
  for (const name of ['الغلاف', 'بيانات العميل', 'السعرات والماكروز', 'خطة الوجبات', 'المكملات', 'التقدم', 'تعليمات وملاحظات', 'خريطة العضلات']) {
    const box = page.getByRole('checkbox', { name, exact: true });
    if (await box.isChecked()) await box.click();
  }
  await expect(page.getByRole('checkbox', { name: 'جدول التمارين', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'اعمل الملف' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'العميل ده ما عندوش برنامج' })).toBeVisible();
  await expect(page.getByText('الملف ما اتعملش')).toHaveCount(0);
});
