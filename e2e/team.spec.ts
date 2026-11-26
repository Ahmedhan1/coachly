import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

/**
 * Gym teams across two phones (two browser contexts) against one mocked Worker. The app code is real: the
 * manager's invite link carries the team key in its fragment, the trainer's phone seals the client summary with
 * it, and the manager's phone opens it. The mock stores exactly the bytes it receives.
 */
const WORKER = 'https://worker.e2e.test';
const MANAGER = { id: 'gym-1', name: 'مدير الجيم', email: 'gym@example.com' };
const TRAINER = { id: 'trainer-1', name: 'كابتن عمر', email: 'omar@example.com' };

interface Server {
  membership: 'none' | 'pending' | 'active';
  trainerMaxClients: number | null;
  inviteCode: string | null;
  roster: Uint8Array | null;
  rosterAt: number;
  calls: string[];
}

function accountFor(token: string, s: Server) {
  if (token === 'tok-manager') {
    return {
      ...MANAGER,
      status: 'approved',
      role: 'gym',
      plan: { maxClients: 30, maxTrainers: 5, expiresAt: 2_000_000_000 },
      gym: { id: MANAGER.id, name: 'جيم الأبطال', membership: 'owner' },
    };
  }
  return {
    ...TRAINER,
    status: s.membership === 'active' ? 'approved' : 'pending',
    role: 'trainer',
    plan: { maxClients: s.membership === 'active' ? s.trainerMaxClients : null, maxTrainers: null, expiresAt: s.membership === 'active' ? 2_000_000_000 : null },
    gym: s.membership === 'none' ? null : { id: MANAGER.id, name: 'جيم الأبطال', membership: s.membership },
  };
}

async function mock(page: Page, s: Server): Promise<void> {
  const reply = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
      body: JSON.stringify(body),
    });
  await page.route(`${WORKER}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return reply(route, 204, {});
    s.calls.push(`${req.method()} ${path}`);
    const token = (req.headers().authorization ?? '').replace('Bearer ', '');
    if (path === '/api/auth-config') return reply(route, 200, { google: false });
    if (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-up/email') {
      const { email } = req.postDataJSON() as { email: string };
      const manager = email === MANAGER.email;
      return reply(route, 200, { token: manager ? 'tok-manager' : 'tok-trainer', user: manager ? MANAGER : TRAINER });
    }
    if (path === '/api/account') return reply(route, 200, { account: accountFor(token, s) });
    if (path === '/api/team/invite') {
      s.inviteCode = 'INVITE_code_0123456789';
      return reply(route, 200, { code: s.inviteCode });
    }
    if (path === '/api/team/join') {
      const { code } = req.postDataJSON() as { code: string };
      if (code !== s.inviteCode) return reply(route, 404, { error: 'invalid_invite' });
      s.membership = 'pending';
      return reply(route, 200, { gym: { id: MANAGER.id, name: 'جيم الأبطال' } });
    }
    if (path === '/api/team') {
      const members = s.membership === 'none' ? [] : [{ id: TRAINER.id, name: TRAINER.name, email: TRAINER.email, status: s.membership, joinedAt: 1, rosterAt: s.roster ? s.rosterAt : null }];
      return reply(route, 200, { gym: { id: MANAGER.id, name: 'جيم الأبطال', inviteOpen: s.inviteCode !== null }, plan: { maxClients: 30, maxTrainers: 5, expiresAt: 2_000_000_000 }, members });
    }
    if (path === `/api/team/members/${TRAINER.id}`) {
      s.membership = 'active';
      return reply(route, 200, { ok: true });
    }
    if (path === '/api/team/roster') {
      // The manager's own summary is ignored here; only the trainer's matters for this test.
      if (token === 'tok-trainer') {
        s.roster = new Uint8Array(req.postDataBuffer() ?? []);
        s.rosterAt = 1_790_000_000;
      }
      return reply(route, 200, { ok: true });
    }
    if (path === '/api/team/rosters') {
      const rosters = s.roster === null ? [] : [{ userId: TRAINER.id, updatedAt: s.rosterAt, body: Buffer.from(s.roster).toString('base64url') }];
      return reply(route, 200, { rosters });
    }
    return reply(route, 404, { error: 'not_found' });
  });
}

async function phone(browser: Browser, s: Server): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
  const page = await context.newPage();
  await mock(page, s);
  return page;
}

async function signIn(page: Page, email: string, hash = ''): Promise<void> {
  await page.goto(`/?standalone=1&worker=${encodeURIComponent(WORKER)}${hash}`);
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر', { exact: true }).fill('password-123');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
}

/** Shoots the screen, not the cold-start splash that fades out after the first render. */
async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/core/${name}.png`, fullPage, animations: 'disabled' });
}

async function skipSetup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'بعدين' }).click();
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
}

test('gym manager invites a trainer, approves them, and reads their encrypted client summary', async ({ browser }) => {
  test.setTimeout(90_000);
  const server: Server = { membership: 'none', trainerMaxClients: null, inviteCode: null, roster: null, rosterAt: 0, calls: [] };

  // Gym manager: Team screen → invite link.
  const manager = await phone(browser, server);
  await signIn(manager, MANAGER.email);
  await skipSetup(manager);
  await manager.goto('/more/team?standalone=1');
  await expect(manager.getByText('جيم الأبطال')).toBeVisible();
  await manager.getByRole('button', { name: 'اعمل لينك دعوة' }).click();
  const link = (await manager.getByTestId('team-invite-link').textContent()) ?? '';
  const hash = new URL(link).hash;
  expect(hash.startsWith('#join=INVITE_code_0123456789.')).toBe(true);
  await shot(manager, 'team-invite', true);

  // Trainer opens the link before having an account: told to sign in, then joins right after.
  const trainer = await phone(browser, server);
  await trainer.goto(`/?standalone=1&worker=${encodeURIComponent(WORKER)}${hash}`);
  await expect(trainer.getByText('ادخل بحسابك أو اعمل حساب، وبعدها هننضم للجيم لوحدنا.')).toBeVisible();
  await trainer.getByLabel('الإيميل').fill(TRAINER.email);
  await trainer.getByLabel('كلمة السر', { exact: true }).fill('password-123');
  await trainer.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(trainer.getByRole('heading', { level: 1, name: 'مستني موافقة جيم الأبطال' })).toBeVisible();
  expect(server.calls).toContain('POST /api/team/join');
  await shot(trainer, 'team-trainer-pending');

  // Manager approves.
  await manager.reload();
  await expect(manager.getByText('مستنيين موافقتك')).toBeVisible();
  await manager.getByRole('button', { name: 'وافق' }).click();
  await expect.poll(() => server.membership).toBe('active');

  // Trainer gets in; the demo clients' summary goes up sealed with the team key.
  await trainer.getByRole('button', { name: 'اتأكد تاني' }).click();
  await skipSetup(trainer);
  await expect.poll(() => server.roster?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const onServer = Buffer.from(server.roster ?? []).toString('utf8');
  expect(onServer.startsWith('PTK1')).toBe(true);
  expect(onServer).not.toContain('سارة');

  // Manager sees the trainer and, decrypted on their own phone, the clients.
  await manager.reload();
  await expect(manager.getByText(TRAINER.name)).toBeVisible();
  await manager.getByText(TRAINER.name).click();
  await expect(manager.getByText('سارة محمود')).toBeVisible();
  await shot(manager, 'team-manager', true);
});

test('a trainer at the plan client limit cannot add another client', async ({ browser }) => {
  const server: Server = { membership: 'active', trainerMaxClients: 1, inviteCode: null, roster: null, rosterAt: 0, calls: [] };
  const trainer = await phone(browser, server);
  await signIn(trainer, TRAINER.email);
  await skipSetup(trainer);
  await trainer.getByRole('button', { name: 'إضافة: عميل، حصة، برنامج' }).click();
  await trainer.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /عميل جديد/ }).click();
  await trainer.getByLabel(/الاسم/).first().fill('عميل زيادة');
  await trainer.getByRole('button', { name: /حفظ|ضيف/ }).first().click();
  await expect(trainer.getByText('اشتراكك بيسمح بـ 1 عميل بس. امسح عميل قديم أو كلّم صاحب التطبيق عشان تزوّد.')).toBeVisible();
});

test('iPhone path: the trainer pastes the invite link inside the installed app', async ({ browser }) => {
  const server: Server = { membership: 'none', trainerMaxClients: null, inviteCode: 'INVITE_code_0123456789', roster: null, rosterAt: 0, calls: [] };
  const trainer = await phone(browser, server);
  await signIn(trainer, TRAINER.email);
  await expect(trainer.getByRole('heading', { level: 1, name: 'حسابك مستني الموافقة' })).toBeVisible();
  const key = 'A'.repeat(43);
  trainer.once('dialog', (d) => void d.accept(`https://app.example/#join=INVITE_code_0123456789.${key}`));
  await trainer.getByTestId('paste-invite').click();
  await expect(trainer.getByRole('heading', { level: 1, name: 'مستني موافقة جيم الأبطال' })).toBeVisible();
  expect(server.membership).toBe('pending');
});
