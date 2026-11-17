import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/** Demo data seeds sessions at 08:00, 10:30 and 18:00 today; pin the clock to 07:00 so the 08:00 one is next. */
test.beforeEach(async ({ page }) => {
  const today = new Date();
  await page.clock.install({ time: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 0) });
});

test('home: next session starts session mode, WhatsApp uses the real number, every block is tappable', async ({ page }) => {
  await openApp(page);
  const hero = page.getByRole('region', { name: 'الحصة الجاية' });
  await expect(hero).toBeVisible();

  // WhatsApp link: Egyptian 01… number with the 20 country code.
  const wa = hero.getByRole('link', { name: /^واتساب/ });
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/201\d{9}$/);

  // Ending-soon and follow-up sections list real demo clients and open them.
  await expect(page.getByText('بتخلص قريب')).toBeVisible();
  await expect(page.getByText('محتاجين متابعة')).toBeVisible();

  // Last backup: real status, opens the backup screen.
  const backup = page.getByRole('link', { name: /لسه مفيش نسخة/ });
  await expect(backup).toBeVisible();
  await backup.click();
  await expect(page).toHaveURL(/\/more\/settings\/backup/);
  await page.goBack();

  // «ابدأ الحصة» opens session mode for that client and booking.
  await hero.getByRole('button', { name: 'ابدأ الحصة' }).click();
  await expect(page).toHaveURL(/\/session\/new\?client=[^&]+&schedule=/);
});

test('home: tapping the next client name opens the client file', async ({ page }) => {
  await openApp(page);
  const hero = page.getByRole('region', { name: 'الحصة الجاية' });
  const name = (await hero.getByRole('button').first().textContent()) ?? '';
  await hero.getByRole('button', { name }).click();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
});
