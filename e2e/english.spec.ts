import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/**
 * The whole app in English: switch from Settings, walk the main screens at Android size, check that the
 * UI chrome has no Arabic letters left (user data such as Arabic client names is allowed), then switch back.
 */
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/english';
const ARABIC = /[؀-ۿ]/;

test.use({ viewport: { width: 412, height: 915 } });

async function settle(page: Page): Promise<void> {
  await expect(page.locator('#boot-splash')).toHaveCount(0, { timeout: 10_000 });
}

/** Arabic text visible on screen, minus the demo/user data the trainer typed (names, notes, foods…). */
async function arabicUiText(page: Page, userData: readonly string[]): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const v = n.textContent?.trim();
      if (!el || !v) continue;
      if (el.closest('[data-user-data], [hidden], script, style')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push(v);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[aria-label], [placeholder]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      for (const a of ['aria-label', 'placeholder']) {
        const v = el.getAttribute(a)?.trim();
        if (v) out.push(v);
      }
    }
    return out;
  });
  const strip = (s: string) => userData.reduce((acc, d) => acc.split(d).join(''), s);
  // One- or two-letter strings are avatar initials of Arabic client names.
  return [...new Set(texts.map(strip).map((s) => s.trim()).filter((s) => s.length > 2 && ARABIC.test(s)))];
}

/** Names and texts that come from the demo data (user data, shown as typed). */
async function demoUserData(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out = new Set<string>();
    const open = indexedDB.open('pt-coach');
    const db = await new Promise<IDBDatabase>((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    const tables = ['clients', 'programs', 'mealPlans', 'recipes', 'supplements', 'sessions', 'foods', 'tasks', 'payments', 'progress'];
    for (const name of tables.filter((t) => db.objectStoreNames.contains(t))) {
      const rows = await new Promise<unknown[]>((res) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => res(req.result as unknown[]);
        req.onerror = () => res([]);
      });
      const walk = (v: unknown) => {
        if (typeof v === 'string') {
          if (/[؀-ۿ]/.test(v)) {
            out.add(v.trim());
            for (const part of v.split(/[\s،,·—\n]+/)) if (part.trim().length > 1) out.add(part.trim());
          }
        } else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      rows.forEach(walk);
    }
    db.close();
    return [...out].sort((a, b) => b.length - a.length);
  });
}

async function expectNoArabicUi(page: Page, userData: readonly string[], screen: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${screen}.png` });
  const left = await arabicUiText(page, userData);
  expect(left, `Arabic UI text on ${screen}`).toEqual([]);
}

test('switching to English and back from Settings', async ({ page }) => {
  await openApp(page, '/more/settings');
  await page.getByTestId('language-switch').getByText('English', { exact: true }).click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(tabs.getByText('Home')).toBeVisible();

  // Tab bar starts on the left in LTR.
  const home = await tabs.getByText('Home').boundingBox();
  const more = await tabs.getByText('Exercises').boundingBox();
  expect(home && more && home.x < more.x).toBe(true);

  await page.getByTestId('language-switch').getByText('العربية', { exact: true }).click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
});

test('main screens show no Arabic UI text in English', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.reload();
  await settle(page);
  const userData = await demoUserData(page);

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'home');

  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'clients');

  await page.getByRole('main').getByRole('link').filter({ hasText: /\S/ }).first().click();
  await expect(page.getByRole('tablist', { name: 'Client file sections' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'client-hub');
  for (const tab of ['Training', 'Sessions', 'Money']) {
    await page.getByRole('tab', { name: tab }).click();
    await expectNoArabicUi(page, userData, `client-hub-${tab.toLowerCase()}`);
  }

  await page.goto('/more/programs');
  await expect(page.getByRole('heading', { name: 'Programs' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'programs');
  await page.getByRole('main').getByRole('link').filter({ hasText: /exercises/ }).first().click();
  await expect(page.getByRole('button', { name: 'Program options' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'program-builder');

  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'schedule');

  await page.goto('/more');
  await expectNoArabicUi(page, userData, 'more');
  await page.goto('/more/settings');
  await expectNoArabicUi(page, userData, 'settings');
  await page.goto('/more/settings/backup');
  await expect(page.getByRole('heading', { name: 'Backup' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'backup');
  await page.goto('/more/assistant');
  await expectNoArabicUi(page, userData, 'assistant');
  await page.goto('/more/pdf');
  await expect(page.getByRole('heading', { name: 'PDF builder' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'pdf');
  await page.goto('/more/income');
  await expectNoArabicUi(page, userData, 'income');
  await page.goto('/more/whatsapp-templates');
  await expectNoArabicUi(page, userData, 'whatsapp');
});

test('the activation screen offers the language switch before activating', async ({ page }) => {
  await page.goto('/?standalone=1');
  const toggle = page.getByTestId('activation-language');
  await expect(toggle).toHaveText(/English/);
  await toggle.click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByLabel('Activation code')).toBeVisible();
  await expect(page.getByTestId('activation-language')).toHaveText(/العربية/);
  await page.screenshot({ path: `${SHOTS}/activation.png` });
});
