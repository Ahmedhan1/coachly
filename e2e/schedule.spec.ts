import { expect, test, type Page } from '@playwright/test';
import { ADD_BUTTON, openApp, openAddClient } from './helpers';

const toast = (page: Page) => page.locator('.toast-host');

test('quick add → حصة opens the booking sheet directly; conflicts are shown; booking offers undo', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: ADD_BUTTON }).click(); // tap 1
  await page.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /حصة/ }).click(); // tap 2
  const sheet = page.getByRole('dialog', { name: 'حصة جديدة' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'منى حسن', exact: true }).click(); // tap 3 (choice)
  // 18:00 today clashes with the demo session of أحمد علي.
  await expect(sheet.getByTestId('conflict-warning')).toContainText('أحمد علي');
  await page.getByRole('button', { name: 'احجز', exact: true }).click();
  await expect(toast(page)).toContainText('اتحجزت حصة منى حسن');
  await toast(page).getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByRole('button', { name: /^منى حسن/ })).toHaveCount(0);
});

test('a weekly series: 4 sessions are booked and the sheet previews the count', async ({ page }) => {
  await openApp(page, '/schedule');
  await page.getByRole('button', { name: 'احجز حصة' }).last().click();
  const sheet = page.getByRole('dialog', { name: 'حصة جديدة' });
  await sheet.getByRole('button', { name: 'ياسمين عادل', exact: true }).click();
  await sheet.getByText('كل أسبوع', { exact: true }).click();
  await sheet.getByLabel('عدد الحصص').fill('4');
  await expect(sheet.getByText('هتتحجز 4 حصة')).toBeVisible();
  await page.getByRole('button', { name: 'احجز', exact: true }).click();
  await expect(toast(page)).toContainText('اتحجزت 4 حصص لـ ياسمين عادل');
});

test('attendance: حضر takes a session from the package, undo gives it back', async ({ page }) => {
  await openApp(page, '/schedule');
  const group = page.getByRole('group', { name: 'الحضور: كريم يوسف' });
  await group.getByRole('button', { name: 'حضر' }).click();
  await expect(group.getByRole('button', { name: 'حضر' })).toHaveAttribute('aria-pressed', 'true');
  await expect(toast(page)).toContainText('باقي 0 حصة');
  await toast(page).getByRole('button', { name: 'تراجع' }).click();
  // The undo is saved before leaving (a full page load would cut a pending write).
  await expect(group.getByRole('button', { name: 'حضر' })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/clients?standalone=1');
  await expect(page.getByRole('link', { name: /كريم يوسف/ })).toBeVisible();
  await page.getByRole('link', { name: /كريم يوسف/ }).click();
  await expect(page.getByRole('heading', { name: /باقي 1 من 16 حصة/ })).toBeVisible();
});

test('schedule settings: the trainer decides whether a no-show uses a session', async ({ page }) => {
  await openApp(page, '/schedule');
  await page.getByRole('button', { name: 'إعدادات المواعيد' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('لو غاب من غير ما يعتذر')).toBeVisible();
  await sheet.getByRole('group', { name: 'لو غاب من غير ما يعتذر' }).getByText('ما تتحسبش').click();
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await page.getByRole('group', { name: 'الحضور: ياسمين عادل' }).getByRole('button', { name: 'غاب' }).click();
  await expect(toast(page)).toContainText('باقي 9 حصة');
});

test('client detail: احجز opens the booking sheet for this client; واتساب offers ready messages to 20…', async ({ page }) => {
  await openApp(page, '/clients');
  await page.getByRole('link', { name: /سارة محمود/ }).click();
  await page.getByRole('button', { name: 'احجز حصة' }).click();
  const sheet = page.getByRole('dialog', { name: 'حصة جديدة' });
  await expect(sheet.getByText('سارة محمود')).toBeVisible();
  await sheet.getByRole('button', { name: 'إلغاء' }).click();
  await page.goBack();
  await page.getByRole('navigation', { name: 'إجراءات سريعة' }).getByRole('button', { name: 'واتساب' }).click();
  const picker = page.getByRole('dialog', { name: /رسالة لـ سارة محمود/ });
  await expect(picker).toBeVisible();
  const first = picker.getByRole('link').first();
  await expect(first).toHaveAttribute('href', /^https:\/\/wa\.me\/201001234567\?text=/);
  // placeholders are filled: no braces reach the client
  await expect(picker).not.toContainText('{الاسم}');
});

test('phone validation: Arabic digits are read, a short Egyptian mobile is refused', async ({ page }) => {
  await openApp(page);
  await openAddClient(page);
  const sheet = page.getByRole('dialog', { name: 'عميل جديد' });
  await sheet.getByLabel('الاسم').fill('عميل تجربة');
  const phone = sheet.getByRole('textbox', { name: /الموبايل/ });
  await phone.fill('٠١٠٠١٢٣');
  await expect(phone).toHaveValue('0100123');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(sheet.getByText('الموبايل المصري 11 رقم')).toBeVisible();
  await phone.fill('٠١٠٠١٢٣٤٥٦٧');
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'عميل تجربة' })).toBeVisible();
});

test('quick add → دفعة: an unpaid charge is settled; paying part leaves the rest owed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: ADD_BUTTON }).click();
  await page.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /دفعة/ }).click();
  await page.getByRole('dialog', { name: 'دفعة من مين؟' }).getByRole('button', { name: 'منى حسن', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'تعديل الدفعة' });
  const amount = sheet.getByRole('textbox', { name: /المبلغ/ });
  await expect(amount).toHaveValue('2000');
  await amount.fill('500');
  await expect(sheet.getByText(/الباقي 1,500 ج.م هيفضل مستحق/)).toBeVisible();
  await sheet.getByRole('button', { name: 'حفظ' }).click();
  await expect(toast(page)).toContainText('باقي عليه 1,500 ج.م');
  await page.goto('/clients?standalone=1');
  await page.getByRole('link', { name: /منى حسن/ }).click();
  await expect(page.getByText('باقي عليه 1,500 ج.م')).toBeVisible();
});

test('outbox: explains that nothing is sent without a tap and shows the exact text', async ({ page }) => {
  await openApp(page, '/more/outbox');
  await expect(page.getByText(/مفيش حاجة بتتبعت لوحدها/)).toBeVisible();
  // Demo: Kareem has one session left in his package → a renewal message with the real price.
  await expect(page.getByText(/أهلاً كريم،\s*باقتك \(16 حصة\) قربت تخلص\. التجديد بـ 4,000 ج\.م/).first()).toBeVisible();
  await page.getByRole('button', { name: 'تجاهل رسالة كريم يوسف' }).click();
  await expect(toast(page)).toContainText('اتشالت من القائمة');
});

test('income: months can be browsed; past months show what was paid in them', async ({ page }) => {
  await openApp(page, '/more/income');
  await expect(page.getByText('اتدفع الشهر ده')).toBeVisible();
  await page.getByRole('button', { name: 'الشهر اللي فات' }).click();
  await expect(page.getByText(/اتدفع في أكتوبر/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /هيجددوا قريب/ })).toHaveCount(0);
});

test.describe('Android', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });

  test('add to calendar: a Google Calendar link (Cairo time) and an .ics download with RRULE and VALARM', async ({ page }) => {
    await openApp(page, '/schedule');
    // make a weekly series to export
    await page.getByRole('button', { name: 'احجز حصة' }).last().click();
    const sheet = page.getByRole('dialog', { name: 'حصة جديدة' });
    await sheet.getByRole('button', { name: 'منى حسن', exact: true }).click();
    await sheet.getByText('كل أسبوع', { exact: true }).click();
    await page.getByRole('button', { name: 'احجز', exact: true }).click();
    await expect(toast(page)).toContainText('منى حسن');
    await page.getByRole('button', { name: /^منى حسن/ }).click();
    const edit = page.getByRole('dialog', { name: 'تعديل الحصة' });
    const google = edit.getByRole('link', { name: 'أضف لتقويم جوجل' });
    await expect(google).toHaveAttribute('href', /calendar\.google\.com.*ctz=Africa%2FCairo.*recur=RRULE%3AFREQ%3DWEEKLY/);
    const [download] = await Promise.all([page.waitForEvent('download'), edit.getByRole('button', { name: 'نزّل ملف التقويم' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    const path = await download.path();
    const text = (await import('node:fs')).readFileSync(path, 'utf8');
    expect(text).toContain('RRULE:FREQ=WEEKLY');
    expect(text).toContain('BEGIN:VALARM');
    expect(text).toContain('TZID=Africa/Cairo');
  });
});

test('200 clients and 2,000 sessions: lists stay usable (long tasks under 4× CPU throttling)', async ({ page, context, browserName }) => {
  test.setTimeout(120_000);
  // The timing budget needs CPU throttling (Chrome DevTools Protocol) and the Long Tasks API, which Safari does
  // not have. WebKit still runs every step below: the lists load, scroll and search with this much data.
  const timed = browserName === 'chromium';
  await context.addInitScript(() => {
    const w = window as unknown as { __lt: number[] };
    w.__lt = [];
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__lt.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  await openApp(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('pt-coach');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = (store: string) =>
      new Promise<Record<string, unknown>[]>((res) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result as Record<string, unknown>[]);
      });
    const [client] = await all('clients');
    const [session] = await all('sessions');
    const tx = db.transaction(['clients', 'sessions'], 'readwrite');
    const now = Date.now();
    for (let i = 0; i < 200; i++) tx.objectStore('clients').put({ ...client, id: `perf-c-${i}`, demo: false, name: `عميل ضغط ${i}`, phone: `010${10_000_000 + i}` });
    for (let j = 0; j < 2000; j++) {
      const start = now - 60 * 86_400_000 + Math.floor(j / 16) * 86_400_000 + (8 + (j % 16)) * 3_600_000;
      tx.objectStore('sessions').put({ ...session, id: `perf-s-${j}`, demo: false, seriesId: null, recurrence: null, clientId: `perf-c-${j % 200}`, startsAt: start - (start % 1_800_000), attendance: start < now ? 'attended' : 'scheduled' });
    }
    await new Promise((res) => (tx.oncomplete = res));
  });
  if (timed) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const longest = async () => {
    const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.splice(0));
    return Math.max(0, ...lt);
  };
  await page.goto('/clients?standalone=1');
  await expect(page.getByText('205 عميل')).toBeVisible();
  await longest();
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.scrollBy(0, 1200)); // no mouse wheel on a WebKit touch device
  await page.getByRole('searchbox', { name: 'بحث' }).pressSequentially('ضغط 19', { delay: 60 });
  await expect(page.getByRole('link', { name: /عميل ضغط 199/ })).toBeVisible();
  const clientsMax = await longest();
  await page.goto('/schedule?standalone=1');
  await page.getByRole('button', { name: 'الأسبوع اللي فات' }).click();
  await page.getByRole('searchbox').first().pressSequentially('ضغط', { delay: 60 });
  await expect(page.getByText(/حصة كمان/)).toBeVisible();
  const scheduleMax = await longest();
  console.log(`longest task after load (4× CPU): clients ${Math.round(clientsMax)}ms, schedule ${Math.round(scheduleMax)}ms`);
  if (timed) {
    expect(clientsMax).toBeLessThan(400);
    expect(scheduleMax).toBeLessThan(400);
  }
});

test('"/clients/:id?renew=1" (Home «جدّد») renews once on arrival with undo', async ({ page }) => {
  await openApp(page, '/clients');
  await page.getByRole('link', { name: /منى حسن/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'منى حسن' })).toBeVisible();
  const url = page.url().split('?')[0] ?? '';
  await page.goto(`${url}?renew=1&standalone=1`);
  await expect(toast(page)).toContainText('منى حسن');
  await expect(page.getByRole('heading', { name: /باقي 8 من 8 حصة/ })).toBeVisible();
  await toast(page).getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByRole('heading', { name: /باقي 0 من 8 حصة/ })).toBeVisible();
});
