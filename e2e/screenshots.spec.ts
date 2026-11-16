import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const OUT = 'docs/screenshots/phase2';
const DEVICES = [
  { name: 'iphone-se', viewport: { width: 375, height: 667 } },
  { name: 'iphone-pro-max', viewport: { width: 430, height: 932 } },
] as const;
const SCHEMES = ['light', 'dark'] as const;

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage, animations: 'disabled' });
}

for (const device of DEVICES) {
  for (const scheme of SCHEMES) {
    test.describe(`${device.name} ${scheme}`, () => {
      test.use({ viewport: device.viewport, colorScheme: scheme, deviceScaleFactor: 2 });

      test('screens', async ({ page }) => {
        const tag = `${device.name}-${scheme}`;
        await page.goto('/');
        await expect(page.getByTestId('install-gate')).toBeVisible();
        await shot(page, `install-gate-${tag}`);

        await openApp(page);
        await expect(page.getByRole('heading', { name: 'حصص النهارده' })).toBeVisible();
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

        await page.getByRole('link', { name: 'الرئيسية' }).click();
        await page.getByRole('button', { name: 'عميل جديد' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.waitForTimeout(400);
        await shot(page, `add-client-sheet-${tag}`);
      });
    });
  }
}
