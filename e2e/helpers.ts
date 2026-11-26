import { expect, type Download, type Page } from '@playwright/test';

export const GUEST_BUTTON = 'ادخل كضيف (للتجربة)';
export const ADD_BUTTON = 'إضافة: عميل، حصة، برنامج';

/** "Continue as guest" (dev and e2e builds only). Leaves the app on the identity setup screen. */
export async function enterAsGuest(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}standalone=1`);
  await page.getByRole('button', { name: GUEST_BUTTON }).click();
}

/** Opens the app past the install gate (e2e bypass), sign-in (guest) and identity setup (skipped). */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}standalone=1`);
  const guest = page.getByRole('button', { name: GUEST_BUTTON });
  const later = page.getByRole('button', { name: 'بعدين' });
  const tabs = page.getByRole('navigation', { name: 'التنقل الرئيسي' });
  const backToClients = page.getByRole('link', { name: 'رجوع للعملاء' });
  await expect(guest.or(later).or(tabs).or(backToClients)).toBeVisible();
  if (await guest.isVisible()) {
    await guest.click();
    await expect(later.or(tabs)).toBeVisible();
  }
  if (await later.isVisible()) await later.click();
  await expect(tabs.or(backToClients)).toBeVisible();
}

/** Center "+" → "عميل جديد": the add-client sheet. */
export async function openAddClient(page: Page): Promise<void> {
  await page.getByRole('button', { name: ADD_BUTTON }).click();
  await page.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /عميل جديد/ }).click();
}

/** Swipes a row toward the inline start (right in RTL) to reveal its delete action. */
export async function swipeToReveal(page: Page, rowText: string): Promise<void> {
  const row = page.getByRole('link', { name: new RegExp(rowText) });
  const box = await row.boundingBox();
  if (!box) throw new Error('row not visible');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * 0.3 + i * 15, y);
  await page.mouse.up();
}

/**
 * Makes the backup file saver behave like Android Chrome: no file share sheet and no save picker, so the
 * backup lands as a plain download. Call before the first navigation.
 */
export async function emulateDownloadOnlySave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
}

/**
 * On the backup screen: «نزّل نسخة على التليفون» → first-time setup (password, or none) → the file downloads →
 * answer «أيوه، لقيته». Needs `emulateDownloadOnlySave` first. Returns the downloaded file.
 */
export async function saveDeviceBackup(page: Page, password: string | null): Promise<Download> {
  await page.getByRole('button', { name: 'نزّل نسخة على التليفون' }).click();
  const sheet = page.getByRole('dialog', { name: 'نسخة التليفون' });
  if (password === null) {
    await sheet.getByRole('checkbox', { name: /اقفل الملف بكلمة سر/ }).uncheck();
  } else {
    await sheet.getByLabel('كلمة السر', { exact: true }).fill(password);
    await sheet.getByLabel('اكتبها تاني').fill(password);
  }
  const download = page.waitForEvent('download', { timeout: 300_000 });
  await sheet.getByRole('button', { name: 'اعمل النسخة' }).click();
  const file = await download;
  // A plain download gives no completion signal: the app asks where the file went.
  await expect(page.getByRole('alertdialog', { name: 'الملف اتنزّل؟' })).toBeVisible();
  await page.getByRole('button', { name: 'أيوه، لقيته' }).click();
  await expect(page.getByText('النسخة اتحفظت برة التطبيق')).toBeVisible();
  return file;
}

/**
 * Waits until the running session the app keeps in IndexedDB (meta 'session.active') has `doneSets` sets marked
 * done. The app saves after every tap, but asynchronously: a reload in the same few milliseconds would simulate
 * the phone dying mid-write, not the app being reopened, so tests that reload wait for the save first.
 */
export async function waitForSavedSession(page: Page, doneSets: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const db: IDBDatabase = await new Promise((res, rej) => {
            const r = indexedDB.open('pt-coach');
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          const row: { value?: { exercises?: { sets: { done: boolean }[] }[] } } | undefined = await new Promise((res) => {
            const r = db.transaction('meta').objectStore('meta').get('session.active');
            r.onsuccess = () => res(r.result as never);
            r.onerror = () => res(undefined);
          });
          db.close();
          return (row?.value?.exercises ?? []).flatMap((e) => e.sets).filter((s) => s.done).length;
        }),
      { timeout: 5_000 },
    )
    .toBe(doneSets);
}
