import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/**
 * Scale test: a trainer's multi-year database (500 clients, ~30k sessions over 3 years, 10k payments,
 * 2k check-ins with photos, 300 meal plans, 200 programs) on an iPhone 13 viewport with the CPU slowed 4x.
 * Prints timings for the main screens; budgets are deliberately generous so the test only fails on
 * regressions of the "seconds, not milliseconds" kind.
 *
 * Slow (a few minutes), so it runs only when asked: `SCALE=1 npx playwright test scale --project=chromium`.
 */
test.skip(!process.env.SCALE, 'set SCALE=1 to run the scale test');
test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling needs the Chrome DevTools Protocol');

const CLIENTS = 500;
const SESSIONS = 30_000;
const PAYMENTS = 10_000;
const PROGRESS = 2_000;
const IMAGES = 400;
const MEAL_PLANS = 300;
const PROGRAMS = 200;

interface SeedCounts {
  clients: number;
  sessions: number;
  payments: number;
  progress: number;
  images: number;
  mealPlans: number;
  programs: number;
}

/** Writes the whole dataset with raw IndexedDB (fast, bypasses the app), after removing the demo rows. */
async function seed(page: Page, counts: SeedCounts): Promise<void> {
  await page.evaluate(async (n) => {
    let state = 42;
    const rnd = () => ((state = (state * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const DAY = 86_400_000;
    const now = Date.now();
    const iso = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const first = ['سارة', 'أحمد', 'منى', 'كريم', 'ياسمين', 'محمد', 'نور', 'عمر', 'هبة', 'يوسف', 'مريم', 'علي'];
    const last = ['محمود', 'علي', 'حسن', 'يوسف', 'عادل', 'إبراهيم', 'سعيد', 'فتحي', '💪', 'الشريف'];
    const goals = ['fat_loss', 'muscle_gain', 'strength', 'fitness', 'rehab', 'other'];
    const meta = (createdAt: number) => ({ createdAt, updatedAt: createdAt, deletedAt: null, demo: false });

    const req = indexedDB.open('pt-coach');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tables = ['clients', 'sessions', 'payments', 'progress', 'images', 'mealPlans', 'programs', 'workoutLogs', 'deletions'];
    const tx = db.transaction([...tables, 'meta'], 'readwrite');
    for (const name of tables) tx.objectStore(name).clear();
    tx.objectStore('meta').delete('demoSeededAt');

    const clientIds: string[] = [];
    for (let i = 0; i < n.clients; i++) {
      const id = `c${String(i).padStart(4, '0')}`;
      clientIds.push(id);
      const created = now - Math.floor(rnd() * 3 * 365) * DAY;
      const end = now + Math.floor(rnd() * 60 - 20) * DAY;
      const hasPackage = rnd() > 0.15;
      tx.objectStore('clients').put({
        id, name: `${pick(first)} ${pick(last)} ${String(i).padStart(4, '0')}`, phone: `010${String(10_000_000 + i)}`,
        gender: rnd() > 0.5 ? 'male' : 'female', birthDate: rnd() > 0.5 ? `19${70 + Math.floor(rnd() * 30)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}` : null,
        goal: pick(goals), goalNote: 'هدف تجريبي', injuries: rnd() > 0.8 ? ['ألم في الركبة'] : [],
        measurements: { weightKg: 50 + Math.floor(rnd() * 60), heightCm: 150 + Math.floor(rnd() * 40) },
        package: hasPackage ? { name: '12 حصة', totalSessions: 12, priceMinor: 300_000, currency: 'EGP' } : null,
        startDate: hasPackage ? iso(end - 30 * DAY) : null, endDate: hasPackage ? iso(end) : null,
        remainingSessions: hasPackage ? Math.floor(rnd() * 12) : 0, notes: 'ملاحظات '.repeat(Math.floor(rnd() * 40)),
        photoId: null, ...meta(created),
      });
    }
    const span = 3 * 365 * DAY;
    for (let i = 0; i < n.sessions; i++) {
      // ~97% in the past three years, the rest in the next four weeks.
      const future = i % 33 === 0;
      const day = future ? Math.floor(rnd() * 28) : -Math.floor(rnd() * (span / DAY));
      const start = new Date(now + day * DAY);
      start.setHours(7 + Math.floor(rnd() * 14), rnd() > 0.5 ? 30 : 0, 0, 0);
      tx.objectStore('sessions').put({
        id: `s${i}`, clientId: pick(clientIds), startsAt: start.getTime(), durationMin: 60, recurrence: null, seriesId: null,
        attendance: future ? 'scheduled' : pick(['attended', 'attended', 'attended', 'missed', 'cancelled']), programId: null,
        notes: '', ...meta(start.getTime() - 7 * DAY),
      });
    }
    for (let i = 0; i < n.payments; i++) {
      const at = now - Math.floor(rnd() * (span / DAY)) * DAY;
      const due = i % 40 === 0;
      tx.objectStore('payments').put({
        id: `p${i}`, clientId: clientIds[i % clientIds.length], amountMinor: 100_000 + Math.floor(rnd() * 500_000), currency: 'EGP',
        status: due ? 'due' : 'paid', paidOn: due ? null : iso(at), dueOn: due ? iso(now + Math.floor(rnd() * 40 - 30) * DAY) : null,
        method: pick(['cash', 'instapay', 'wallet']), note: '', ...meta(at),
      });
    }
    const imageIds: string[] = [];
    for (let i = 0; i < n.images; i++) {
      const bytes = new Uint8Array(30_000);
      for (let b = 0; b < bytes.length; b += 4) bytes[b] = Math.floor(rnd() * 256);
      const id = `img${i}`;
      imageIds.push(id);
      tx.objectStore('images').put({ id, mime: 'image/jpeg', width: 800, height: 1000, bytes: bytes.length, createdAt: now - i * DAY, demo: false, blob: new Blob([bytes], { type: 'image/jpeg' }) });
    }
    for (let i = 0; i < n.progress; i++) {
      const at = now - Math.floor(rnd() * (span / DAY)) * DAY;
      tx.objectStore('progress').put({
        id: `g${i}`, clientId: clientIds[i % clientIds.length], date: iso(at), measurements: { weightKg: 60 + Math.floor(rnd() * 40) },
        photoIds: i < imageIds.length ? [imageIds[i] as string] : [], notes: '', source: 'trainer', ...meta(at),
      });
    }
    for (let i = 0; i < n.mealPlans; i++) {
      tx.objectStore('mealPlans').put({
        id: `m${i}`, clientId: clientIds[i % clientIds.length], name: `خطة ${i}`, targetKcal: 2000,
        meals: [1, 2, 3, 4].map((k) => ({ id: `meal${k}`, name: `وجبة ${k}`, time: null, items: [{ recipeId: null, text: 'شوفان', servings: 1 }] })),
        notes: '', ...meta(now - i * DAY),
      });
    }
    for (let i = 0; i < n.programs; i++) {
      tx.objectStore('programs').put({
        id: `r${i}`, name: `برنامج ${i}`, clientId: clientIds[i % clientIds.length], isTemplate: false,
        days: [1, 2, 3].map((d) => ({
          id: `d${d}`, name: `يوم ${d}`,
          items: [1, 2, 3, 4, 5, 6].map((k) => ({ id: `it${k}`, exerciseId: `ex${k}`, sets: 3, reps: '8-12', restSec: 90, tempo: '', rpe: null, supersetGroup: null, notes: '' })),
        })),
        notes: '', ...meta(now - i * DAY),
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, counts);
}

/** Runs `action` in the page and returns ms until an element matching `selector` contains `text` (rAF-polled). */
async function timeUntil(page: Page, action: 'none' | { navigate: string } | { type: { selector: string; value: string } } | { click: string }, selector: string, text: string, count?: number): Promise<number> {
  return page.evaluate(
    async ({ action, selector, text, count }) => {
      const t0 = performance.now();
      if (action !== 'none' && 'navigate' in action) {
        history.pushState(null, '', action.navigate);
        dispatchEvent(new PopStateEvent('popstate'));
      } else if (action !== 'none' && 'click' in action) {
        const el = document.querySelector<HTMLElement>(action.click);
        if (!el) throw new Error(`no ${action.click}`);
        el.click();
      } else if (action !== 'none') {
        const input = document.querySelector<HTMLInputElement>(action.type.selector);
        if (!input) throw new Error(`no ${action.type.selector}`);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, action.type.value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const done = () => {
        const all = [...document.querySelectorAll(selector)];
        const hit = all.filter((el) => (el.textContent ?? '').includes(text));
        return count === undefined ? hit.length > 0 : hit.length === count && all.length === count;
      };
      const base = action === 'none' ? 0 : t0;
      for (;;) {
        if (done()) return performance.now() - base;
        if (performance.now() - t0 > 60_000) throw new Error(`timeout waiting for ${selector} ~ ${text}`);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    },
    { action, selector, text, count },
  );
}

/** Scrolls the page to the bottom in steps; returns total time and the longest frame. */
async function scrollThrough(page: Page): Promise<{ totalMs: number; longestFrameMs: number; rows: number }> {
  return page.evaluate(async () => {
    const frame = () => new Promise<number>((r) => requestAnimationFrame((t) => r(t)));
    let longest = 0;
    const t0 = performance.now();
    let prev = await frame();
    for (let i = 0; i < 400; i++) {
      window.scrollBy(0, 300);
      const t = await frame();
      longest = Math.max(longest, t - prev);
      prev = t;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        // Give an incremental list the chance to grow; stop when it no longer does.
        const h = document.documentElement.scrollHeight;
        await frame();
        await frame();
        if (document.documentElement.scrollHeight === h) break;
      }
    }
    const rows = document.querySelectorAll('section[aria-label="العملاء"] a').length;
    return { totalMs: performance.now() - t0, longestFrameMs: longest, rows };
  });
}

test('scale: multi-year data on a throttled iPhone 13 viewport', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const t0 = Date.now();
  await seed(page, { clients: CLIENTS, sessions: SESSIONS, payments: PAYMENTS, progress: PROGRESS, images: IMAGES, mealPlans: MEAL_PLANS, programs: PROGRAMS });
  const seedMs = Date.now() - t0;

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const results: Record<string, number | string> = { seedMs };
  // Cold start: full reload, time from navigation start to home sections rendered with data.
  const cold: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.reload();
    cold.push(await timeUntil(page, 'none', 'h2', 'محتاجين متابعة'));
  }
  results.coldStartHomeMs = Math.round(cold.sort((a, b) => a - b)[1] ?? 0);

  results.clientsListMs = Math.round(await timeUntil(page, { navigate: '/clients' }, 'section[aria-label="العملاء"] a', ''));
  const scroll = await scrollThrough(page);
  results.clientsScrollMs = Math.round(scroll.totalMs);
  results.clientsScrollLongestFrameMs = Math.round(scroll.longestFrameMs);
  results.clientsRowsReached = scroll.rows;
  await page.evaluate(() => window.scrollTo(0, 0));
  results.clientsSearchMs = Math.round(
    await timeUntil(page, { type: { selector: 'input[type="search"]', value: '0377' } }, 'section[aria-label="العملاء"] a', '0377', 1),
  );

  results.clientDetailMs = Math.round(await timeUntil(page, { navigate: '/clients/c0042' }, 'h2', 'المدفوعات'));
  results.scheduleDayMs = Math.round(await timeUntil(page, { navigate: '/schedule' }, 'header p', 'حصص'));
  results.scheduleWeekMs = Math.round(await timeUntil(page, { click: 'input[type="radio"][value="week"]' }, 'header p', '–'));

  results.incomeMs = Math.round(await timeUntil(page, { navigate: '/more/income' }, 'h2', 'متأخر'));
  results.outboxMs = Math.round(await timeUntil(page, { navigate: '/more/outbox' }, 'h1', 'رسايل النهارده'));
  await expect(page.getByRole('link', { name: /ابعت|واتساب/ }).first().or(page.getByText('مفيش رسايل')).first()).toBeVisible();

  // Backup export (plain zip) through the real screen.
  await page.evaluate(() => {
    history.pushState(null, '', '/more/settings/backup');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  await page.getByRole('dialog').getByRole('checkbox').uncheck();
  const e0 = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'اعمل ملف نسخة' }).click();
  const ready = page.getByRole('button', { name: /الملف جاهز/ });
  await expect(ready).toBeVisible({ timeout: 300_000 });
  results.backupExportMs = Date.now() - e0;
  results.backupLabel = (await ready.textContent()) ?? '';
  const [download] = await Promise.all([page.waitForEvent('download'), ready.click()]);
  const file = testInfo.outputPath('scale-backup.zip');
  await download.saveAs(file);
  const { size } = await import('node:fs').then((fs) => fs.statSync(file));
  results.backupBytes = size;

  // Restore it (replaces everything).
  await page.getByRole('button', { name: 'استرجاع من ملف' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
  let restoredAt = 0;
  page.on('dialog', (d) => {
    if (d.type() === 'alert') restoredAt = Date.now();
    void d.accept();
  });
  const r0 = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'أيوه، استرجع' }).click();
  await expect.poll(() => restoredAt, { timeout: 300_000 }).toBeGreaterThan(0);
  results.restoreMs = restoredAt - r0;
  await expect(page.getByRole('heading', { name: 'محتاجين متابعة' })).toBeVisible({ timeout: 60_000 });
  const counts = await page.evaluate(async () => {
    const req = indexedDB.open('pt-coach');
    const db = await new Promise<IDBDatabase>((resolve) => (req.onsuccess = () => resolve(req.result)));
    const tx = db.transaction(['clients', 'sessions', 'payments', 'images'], 'readonly');
    const count = (n: string) => new Promise<number>((r) => {
      const q = tx.objectStore(n).count();
      q.onsuccess = () => r(q.result);
    });
    const out = { clients: await count('clients'), sessions: await count('sessions'), payments: await count('payments'), images: await count('images') };
    db.close();
    return out;
  });
  expect(counts).toEqual({ clients: CLIENTS, sessions: SESSIONS, payments: PAYMENTS, images: IMAGES });

  console.log(`SCALE RESULTS ${JSON.stringify(results, null, 2)}`);
  await testInfo.attach('scale-results', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.coldStartHomeMs).toBeLessThan(15_000);
});
