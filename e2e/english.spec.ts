import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { nutrition as arNutrition } from '../src/i18n/features/nutrition';
import { openApp } from './helpers';

/**
 * The whole app in English: switch from Settings, walk the main screens at Android size, check that the
 * UI chrome has no Arabic letters left (user data such as Arabic client names is allowed), then switch back.
 */
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/english';
const ARABIC = /[؀-ۿ]/;

/** Until the nutrition area has its English file, its Arabic strings are allowed (another agent owns it). */
const PENDING: readonly string[] = existsSync('src/i18n/en/nutrition.ts') ? [] : leaves(arNutrition).map((s) => s.replace(/\{\w+\}/g, '').trim());
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  return node && typeof node === 'object' ? Object.values(node).flatMap(leaves) : [];
}
const isPending = (s: string) => PENDING.some((p) => p.length > 2 && (s.includes(p) || p.includes(s)));

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
      if (el.closest('[data-user-data], [data-bilingual], [hidden], script, style')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push(v);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[aria-label], [placeholder]')) {
      const r = el.getBoundingClientRect();
      if ((r.width === 0 && r.height === 0) || el.closest('[data-user-data], [data-bilingual]')) continue;
      for (const a of ['aria-label', 'placeholder']) {
        const v = el.getAttribute(a)?.trim();
        if (v) out.push(v);
      }
    }
    return out;
  });
  const strip = (s: string) => userData.reduce((acc, d) => acc.split(d).join(''), s);
  // One- or two-letter strings are avatar initials of Arabic client names.
  return [...new Set(texts.filter((s) => !isPending(s)).map(strip).map((s) => s.trim()).filter((s) => s.length > 2 && ARABIC.test(s)))];
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
  await expect(page.getByRole('heading', { name: 'Settings', exact: true, level: 1 })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'الإعدادات', exact: true, level: 1 })).toBeVisible();
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
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Clients', exact: true, level: 1 })).toBeVisible();
  await expectNoArabicUi(page, userData, 'clients');

  await page.getByRole('main').getByRole('link').filter({ hasText: /\S/ }).first().click();
  await expect(page.getByRole('tablist', { name: 'Client file sections' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'client-hub');
  for (const tab of ['Training', 'Sessions', 'Money']) {
    await page.getByRole('tab', { name: tab }).click();
    await expectNoArabicUi(page, userData, `client-hub-${tab.toLowerCase()}`);
  }

  await page.goto('/more/programs');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Programs', exact: true, level: 1 })).toBeVisible();
  await expectNoArabicUi(page, userData, 'programs');
  await page.getByRole('button', { name: /Push \/ Pull \/ Legs/ }).click();
  await expect(page.getByRole('button', { name: 'Program options' })).toBeVisible();
  await expectNoArabicUi(page, userData, 'program-builder');

  await page.goto('/schedule');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Schedule', exact: true, level: 1 })).toBeVisible();
  await expectNoArabicUi(page, userData, 'schedule');

  await page.goto('/more');
  await settle(page);
  await expectNoArabicUi(page, userData, 'more');
  await page.goto('/more/settings');
  await settle(page);
  await expectNoArabicUi(page, userData, 'settings');
  await page.goto('/more/settings/backup');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Backup', exact: true, level: 1 })).toBeVisible();
  await expectNoArabicUi(page, userData, 'backup');
  await page.goto('/more/assistant');
  await settle(page);
  await expectNoArabicUi(page, userData, 'assistant');
  await page.goto('/more/pdf');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'PDF builder', exact: true, level: 1 })).toBeVisible();
  await expectNoArabicUi(page, userData, 'pdf');
  await page.goto('/more/income');
  await settle(page);
  await expectNoArabicUi(page, userData, 'income');
  await page.goto('/more/whatsapp-templates');
  await settle(page);
  await expectNoArabicUi(page, userData, 'whatsapp');
});

test('the activation screen offers the language switch before activating', async ({ page }) => {
  await page.goto('/?standalone=1');
  await settle(page);
  const toggle = page.getByTestId('activation-language');
  await expect(toggle).toHaveText(/English/);
  await toggle.click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByLabel('Activation code')).toBeVisible();
  await expect(page.getByTestId('activation-language')).toHaveText(/العربية/);
  await page.screenshot({ path: `${SHOTS}/activation.png` });
});

test('PDF in English: generates, previews LTR pages, and a session screen in English', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pt.locale', 'en'));
  await page.goto('/more/programs');
  await settle(page);
  // A program for the first demo client, so the PDF has a training plan and a session can start.
  await page.getByRole('button', { name: /Push \/ Pull \/ Legs/ }).click();
  await page.getByRole('button', { name: 'Program options' }).click();
  await page.getByRole('button', { name: 'Assign to a client' }).click();
  await page.getByRole('dialog').getByRole('listitem').first().getByRole('button').click();
  await expect(page.getByText(/Program assigned to/)).toBeVisible();
  const programUrl = page.url();

  await page.getByRole('button', { name: 'Program options' }).click();
  await page.getByRole('button', { name: 'Start a session with this day' }).click();
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/session.png` });

  await page.goto(programUrl);
  await settle(page);
  await page.goto('/more/pdf');
  await settle(page);
  await page.getByLabel('Client', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Create the file' }).click();
  await expect(page.getByText(/File ready: \d+ pages/)).toBeVisible({ timeout: 90_000 });
  const first = page.getByRole('img', { name: 'Page 1' });
  await expect(first).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/pdf-ready.png`, fullPage: false });
  const pages = page.getByRole('img', { name: /^Page \d+$/ });
  const n = await pages.count();
  for (let i = 0; i < Math.min(n, 3); i++) await pages.nth(i).screenshot({ path: `${SHOTS}/pdf-page-${i + 1}.png` });
});
