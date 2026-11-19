import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const OUT = 'docs/screenshots/final';
const DEVICES = [
  { name: 'iphone-se', viewport: { width: 375, height: 667 } },
  { name: 'iphone-pro-max', viewport: { width: 430, height: 932 } },
] as const;

async function shot(page: Page, name: string) {
  // The cold-start splash fades out after the first screen renders; shoot the screen, not the splash.
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

for (const device of DEVICES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`feature screens ${device.name} ${scheme}`, async ({ page }) => {
      test.setTimeout(90_000);
      const tag = `${device.name}-${scheme}`;
      await page.setViewportSize(device.viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      await page.getByRole('link', { name: 'العملاء', exact: true }).click();
      await page.getByRole('link', { name: /سارة محمود/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'سارة محمود' })).toBeVisible();
      await page.getByRole('heading', { name: 'البرنامج والمتابعة' }).scrollIntoViewIfNeeded();
      await shot(page, `client-plan-${tag}`);

      await page.getByRole('link', { name: /البرنامج/ }).first().click();
      await shot(page, `programs-${tag}`);
      await page.getByRole('button', { name: /بوش \/ بول \/ ليجز/ }).click();
      await expect(page.getByTestId('exercise-card').first()).toBeVisible();
      await shot(page, `builder-${tag}`);
      await page.getByRole('button', { name: 'خيارات البرنامج' }).click();
      await page.getByRole('button', { name: 'ابدأ حصة باليوم ده' }).click();
      await expect(page.getByRole('button', { name: 'خلّصت السيت' })).toBeVisible();
      await shot(page, `session-${tag}`);
      await page.getByRole('button', { name: 'خلّصت السيت' }).click();
      await shot(page, `session-rest-${tag}`);

      await page.goto('/clients?standalone=1');
      await page.getByRole('link', { name: /سارة محمود/ }).click();
      await page.getByRole('link', { name: /السعرات والماكروز/ }).click();
      await page.getByLabel('السن').fill('30');
      await shot(page, `calculator-${tag}`);
      await page.getByRole('link', { name: 'الوجبات' }).click();
      await shot(page, `meals-${tag}`);
      await page.getByRole('link', { name: 'المكملات', exact: true }).click();
      await shot(page, `client-supplements-${tag}`);
      await page.getByRole('link', { name: 'التقدم', exact: true }).click();
      await shot(page, `progress-${tag}`);

      await page.goto('/more/pdf?standalone=1');
      await shot(page, `pdf-${tag}`);
      await page.goto('/more/income?standalone=1');
      await shot(page, `income-${tag}`);
      await page.goto('/more/supplements?standalone=1');
      await shot(page, `supplements-${tag}`);
      await page.goto('/more/recipes?standalone=1');
      await shot(page, `recipes-${tag}`);
      await page.goto('/more/settings?standalone=1');
      await shot(page, `settings-${tag}`);
      await page.goto('/more/settings/backup?standalone=1');
      await shot(page, `backup-${tag}`);
      await page.goto('/more/settings/notifications?standalone=1');
      await shot(page, `notifications-${tag}`);
      await page.goto('/more/settings/formulas?standalone=1');
      await shot(page, `formulas-${tag}`);
      await page.goto('/more?standalone=1');
      await shot(page, `more-${tag}`);
    });
  }
}
