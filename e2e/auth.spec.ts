import { expect, test, type Page, type Route } from '@playwright/test';
import { GUEST_BUTTON } from './helpers';

/**
 * Sign-in against a mocked account Worker (`?worker=` is honoured by the e2e build only). Covers email +
 * password, owner approval, Google's return trip (#auth=<one-time token>), offline after sign-in, and guest.
 */
const WORKER = 'https://worker.e2e.test';
const USER = { id: 'u-e2e', name: 'كابتن تجربة', email: 'coach@example.com' };

interface MockState {
  status: 'pending' | 'approved' | 'disabled';
  google: boolean;
  calls: string[];
  /** Which account signs in (id), and whether it has a cloud backup. */
  userId?: string;
  backup?: boolean;
}

async function mockWorker(page: Page, initial: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = { status: 'approved', google: false, calls: [], ...initial };
  const reply = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
      body: JSON.stringify(body),
    });
  await page.route(`${WORKER}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return reply(route, 204, {});
    state.calls.push(`${request.method()} ${path}`);
    if (path === '/api/auth-config') return reply(route, 200, { google: state.google });
    if (path === '/api/auth/sign-up/email') return reply(route, 200, { token: 'tok-up', user: { ...USER, id: state.userId ?? USER.id } });
    if (path === '/api/auth/sign-in/email') {
      const body = request.postDataJSON() as { password?: string };
      return body.password === 'right-password'
        ? reply(route, 200, { token: 'tok-in', user: { ...USER, id: state.userId ?? USER.id } })
        : reply(route, 401, { code: 'INVALID_EMAIL_OR_PASSWORD' });
    }
    if (path === '/api/auth/one-time-token/verify') return reply(route, 200, { session: { token: 'tok-google' }, user: USER });
    if (path === '/api/account') {
      return request.headers().authorization?.startsWith('Bearer tok-')
        ? reply(route, 200, { account: { ...USER, id: state.userId ?? USER.id, status: state.status } })
        : reply(route, 401, { error: 'invalid' });
    }
    if (path === '/api/auth/sign-out') return reply(route, 200, { success: true });
    if (path === '/api/backup' && request.method() === 'HEAD') {
      return state.backup
        ? route.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-Backup-Size, X-Backup-Uploaded-At', 'X-Backup-Size': '2048', 'X-Backup-Uploaded-At': '1790000000' },
          })
        : reply(route, 404, { error: 'not_found' });
    }
    return reply(route, 404, { error: 'not_found' });
  });
  return state;
}

const open = (page: Page, extra = '') => page.goto(`/?standalone=1&worker=${encodeURIComponent(WORKER)}${extra}`);
const setupStep = (page: Page) => page.getByText('خطوة 1 من 4');

test('a new account waits for the owner, then opens the app once approved', async ({ page }) => {
  const worker = await mockWorker(page, { status: 'pending' });
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'أهلاً بيك' })).toBeVisible();
  await page.getByRole('radio', { name: 'حساب جديد' }).check({ force: true });
  await page.getByLabel('اسمك').fill(USER.name);
  await page.getByLabel('الإيميل').fill(USER.email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'اعمل الحساب' }).click();
  await expect(page.getByText('كلمة السر لازم تكون 8 حروف على الأقل.')).toBeVisible();
  expect(worker.calls).not.toContain('POST /api/auth/sign-up/email');

  await page.getByLabel('كلمة السر', { exact: true }).fill('long-enough-1');
  await page.getByRole('button', { name: 'اعمل الحساب' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'حسابك مستني الموافقة' })).toBeVisible();
  await expect(page.getByText(USER.email)).toBeVisible();
  await page.getByRole('button', { name: 'اتأكد تاني' }).click();
  await expect(page.getByText('لسه مستني الموافقة.')).toBeVisible();

  worker.status = 'approved';
  await page.getByRole('button', { name: 'اتأكد تاني' }).click();
  await expect(setupStep(page)).toBeVisible();
});

test('signs in with email + password, then works offline after a reload', async ({ page, context }) => {
  await mockWorker(page);
  await open(page);
  await page.getByLabel('الإيميل').fill(USER.email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('الإيميل أو كلمة السر غلط.');

  await page.getByLabel('كلمة السر', { exact: true }).fill('right-password');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(setupStep(page)).toBeVisible();
  await page.getByRole('button', { name: 'بعدين' }).click();
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();

  // Golden rule: once signed in, no network is needed.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
  await context.setOffline(false);

  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /الإعدادات/ }).click();
  await expect(page.getByText(USER.email)).toBeVisible();
  await page.getByRole('button', { name: /خروج من الحساب/ }).click();
  await page.getByTestId('confirm-sign-out').click();
  await expect(page.getByRole('heading', { level: 1, name: 'أهلاً بيك' })).toBeVisible();
});

test('a disabled account is locked with a clear message', async ({ page }) => {
  await mockWorker(page, { status: 'disabled' });
  await open(page);
  await page.getByLabel('الإيميل').fill(USER.email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('right-password');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'الحساب ده متوقف' })).toBeVisible();
});

test('Google: the button shows only when the Worker has it, and the return trip signs in', async ({ page }) => {
  await mockWorker(page, { google: true });
  await open(page);
  await expect(page.getByTestId('google-sign-in')).toBeVisible();
  // What the Worker's /auth/handoff sends the browser back to (a full load, coming from another site):
  await page.goto('about:blank');
  await open(page, '#auth=one-time-token-e2e');
  await expect(setupStep(page)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('Google error on return shows a message on the sign-in screen', async ({ page }) => {
  await mockWorker(page);
  await open(page, '#auth_error=google_failed');
  await expect(page.getByRole('alert')).toHaveText('الدخول بجوجل ما كملش. جرّب تاني.');
  await expect(page.getByTestId('google-sign-in')).toHaveCount(0);
});

test('the dev/e2e guest button opens the app without an account', async ({ page }) => {
  await page.goto('/?standalone=1');
  await page.getByRole('button', { name: GUEST_BUTTON }).click();
  await expect(setupStep(page)).toBeVisible();
});

async function signInAs(page: Page) {
  await page.getByLabel('الإيميل').fill(USER.email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('right-password');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
}

test('another account on the same phone never sees the first account clients', async ({ page }) => {
  const worker = await mockWorker(page, { userId: 'account-a' });
  await open(page);
  await signInAs(page);
  await page.getByRole('button', { name: 'بعدين' }).click();
  // Account A adds a client of its own (the demo clients do not count as anyone's data).
  await page.getByRole('button', { name: 'إضافة: عميل، حصة، برنامج' }).click();
  await page.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /عميل جديد/ }).click();
  await page.getByLabel(/الاسم/).first().fill('عميل الحساب الأول');
  await page.getByRole('button', { name: /حفظ|ضيف/ }).first().click();
  await expect(page.getByRole('heading', { name: 'عميل الحساب الأول' })).toBeVisible();
  await page.goto('/more/settings?standalone=1');
  await page.getByRole('button', { name: /خروج من الحساب/ }).click();
  await page.getByTestId('confirm-sign-out').click();

  // Account B signs in on the same phone.
  worker.userId = 'account-b';
  await signInAs(page);
  await expect(page.getByRole('heading', { level: 1, name: 'التليفون ده عليه بيانات حساب تاني' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('erase-device-data').click();
  await expect(setupStep(page)).toBeVisible();
  await page.getByRole('button', { name: 'بعدين' }).click();
  await page.goto('/clients?standalone=1');
  await expect(page.getByText('عميل الحساب الأول')).toHaveCount(0);
});

test('a new phone is offered its cloud backup once, and can skip it', async ({ page }) => {
  await mockWorker(page, { userId: 'account-c', backup: true });
  await open(page);
  await signInAs(page);
  await expect(page.getByRole('heading', { level: 1, name: 'رجّع بياناتك' })).toBeVisible();
  await expect(page.getByText(/النسخة: .*آخر تحديث/)).toBeVisible();
  await page.getByTestId('skip-restore').click();
  await expect(setupStep(page)).toBeVisible();
  await page.reload();
  await expect(setupStep(page)).toBeVisible();
});

test.describe('screenshots (docs/screenshots/core/auth-*)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
    test(`sign-in, new account and approval gate (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const worker = await mockWorker(page, { status: 'pending', google: true });
      const shot = async (name: string) => {
        await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 10_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `docs/screenshots/core/auth-${name}-${scheme}.png`, fullPage: true, animations: 'disabled' });
      };
      await open(page);
      await expect(page.getByTestId('google-sign-in')).toBeVisible();
      await page.getByLabel('الإيميل').fill(USER.email);
      await page.getByLabel('كلمة السر', { exact: true }).fill('secret-password');
      await shot('sign-in');
      await page.getByRole('radio', { name: 'حساب جديد' }).check({ force: true });
      await page.getByLabel('اسمك').fill(USER.name);
      await page.getByRole('button', { name: 'اعمل الحساب' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'حسابك مستني الموافقة' })).toBeVisible();
      await shot('pending');
      await page.getByTestId('auth-language').click();
      await page.getByRole('button', { name: 'Sign out and use another account' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible();
      await page.getByLabel('Email').fill(USER.email);
      await page.getByLabel('Password', { exact: true }).fill('secret-password');
      await shot('sign-in-en');
      await page.getByTestId('auth-language').click();
      expect(worker.calls).toContain('POST /api/auth/sign-out');
    });
  }
});
