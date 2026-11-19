import { expect, test, type Page } from '@playwright/test';
import { DEMO_CODE, openAddClient } from './helpers';

const OUT = 'docs/screenshots/core';
const DEVICES = [
  { name: 'iphone-se', viewport: { width: 375, height: 667 } },
  { name: 'iphone-pro-max', viewport: { width: 430, height: 932 } },
] as const;
const SCHEMES = ['light', 'dark'] as const;
/** Fixed wall clock (Cairo 17:20) so the hero shows "18:00 in 40 minutes" like the design mock. */
const NOW = new Date('2026-11-16T17:20:00+02:00');

async function shot(page: Page, name: string, fullPage = false) {
  // The cold-start splash fades out after the first screen renders; shoot the screen, not the splash.
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage, animations: 'disabled' });
}

for (const device of DEVICES) {
  for (const scheme of SCHEMES) {
    test.describe(`${device.name} ${scheme}`, () => {
      test.use({ viewport: device.viewport, colorScheme: scheme, deviceScaleFactor: 2 });

      test('screens', async ({ page }) => {
        await page.clock.setFixedTime(NOW);
        const tag = `${device.name}-${scheme}`;
        await page.goto('/');
        await expect(page.getByTestId('install-gate')).toBeVisible();
        await shot(page, `install-gate-${tag}`);

        await page.goto('/?standalone=1');
        await expect(page.getByTestId('device-id')).not.toHaveText('…');
        await page.getByLabel('كود التفعيل').fill(DEMO_CODE);
        await shot(page, `activation-${tag}`);
        await page.getByRole('button', { name: 'تفعيل', exact: true }).click();

        await expect(page.getByText('خطوة 1 من 4')).toBeVisible();
        await page.getByLabel('اسمك زي ما تحب العملاء يشوفوه').fill('كابتن كريم');
        await page.getByLabel('اسمك زي ما تحب العملاء يشوفوه').blur();
        await shot(page, `identity-name-${tag}`);
        await page.getByRole('button', { name: 'التالي' }).click();
        await page.getByRole('button', { name: 'التالي' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'لون الهوية' })).toBeVisible();
        await shot(page, `identity-color-${tag}`);
        await shot(page, `identity-color-full-${tag}`, true);
        await page.getByRole('button', { name: 'التالي' }).click();
        await shot(page, `identity-units-${tag}`);
        await page.getByRole('button', { name: 'يلا نبدأ' }).click();

        await expect(page.getByRole('heading', { name: 'باقي اليوم' })).toBeVisible();
        await shot(page, `home-${tag}`);
        await shot(page, `home-full-${tag}`, true);

        await page.getByRole('link', { name: 'العملاء', exact: true }).click();
        await expect(page).toHaveURL(/\/clients$/);
        await expect(page.getByRole('link', { name: /سارة محمود/ })).toBeVisible();
        await shot(page, `clients-${tag}`);

        await page.getByRole('link', { name: /سارة محمود/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'سارة محمود' })).toBeVisible();
        await shot(page, `client-detail-${tag}`);
        await shot(page, `client-detail-full-${tag}`, true);

        await page.getByRole('link', { name: 'رجوع للعملاء' }).click();
        await openAddClient(page);
        await expect(page.getByRole('dialog', { name: 'عميل جديد' })).toBeVisible();
        await page.waitForTimeout(400);
        await shot(page, `add-client-sheet-${tag}`);
      });
    });
  }
}
