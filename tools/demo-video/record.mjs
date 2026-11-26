#!/usr/bin/env node
// Records the demo video's raw footage from the REAL app (e2e build, Pebble design) on an iPhone-sized screen.
// The account server is mocked inside the browser only (nothing is sent anywhere); the gym manager's phone is filmed,
// a second, unfilmed "trainer phone" joins the gym and uploads its encrypted client summary.
// Frames come from Chrome's screencast at the real 2× resolution (Playwright's recorder captures 1× only).
// Writes <out>/raw.mp4 and <out>/events.json (taps, scene captions and cuts, in ms from the start of the footage).
// Usage: node tools/demo-video/record.mjs <out dir> [app url, default http://localhost:4410]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'demo-out';
const APP = process.argv[3] ?? 'http://localhost:4410';
const WORKER = 'https://worker.demo.test';
const MANAGER = { id: 'gym-1', name: 'كابتن مازن', email: 'mazen@example.com' };
const TRAINER = { id: 'trainer-1', name: 'كابتن عمر', email: 'omar@example.com' };
/** Same wall clock as the screenshots (Cairo 17:20): the home hero shows the 18:00 session. */
const NOW = new Date('2026-11-16T17:20:00+02:00');
const VIEW = { width: 390, height: 844 };
mkdirSync(out, { recursive: true });

const server = { membership: 'none', invite: null, roster: null };

function account(token) {
  if (token === 'tok-manager') {
    return { ...MANAGER, status: 'approved', role: 'gym', plan: { maxClients: 40, maxTrainers: 5, expiresAt: 2_000_000_000 }, gym: { id: MANAGER.id, name: 'جيم الأبطال', membership: 'owner' } };
  }
  const active = server.membership === 'active';
  return { ...TRAINER, status: active ? 'approved' : 'pending', role: 'trainer', plan: { maxClients: null, maxTrainers: null, expiresAt: active ? 2_000_000_000 : null }, gym: server.membership === 'none' ? null : { id: MANAGER.id, name: 'جيم الأبطال', membership: server.membership } };
}

async function mockWorker(page) {
  const reply = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: JSON.stringify(body) });
  await page.route(`${WORKER}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return reply(route, 204, {});
    const token = (req.headers().authorization ?? '').replace('Bearer ', '');
    if (path === '/api/auth-config') return reply(route, 200, { google: true });
    if (path === '/api/auth/sign-in/email') {
      const manager = req.postDataJSON().email === MANAGER.email;
      return reply(route, 200, { token: manager ? 'tok-manager' : 'tok-trainer', user: manager ? MANAGER : TRAINER });
    }
    if (path === '/api/account') return reply(route, 200, { account: account(token) });
    if (path === '/api/team/invite') return reply(route, 200, { code: (server.invite = 'INVITE_demo_0123456789') });
    if (path === '/api/team/join') {
      server.membership = 'pending';
      return reply(route, 200, { gym: { id: MANAGER.id, name: 'جيم الأبطال' } });
    }
    if (path === '/api/team') {
      const members = server.membership === 'none' ? [] : [{ id: TRAINER.id, name: TRAINER.name, email: TRAINER.email, status: server.membership, joinedAt: 1, rosterAt: server.roster ? 1_790_000_000 : null }];
      return reply(route, 200, { gym: { id: MANAGER.id, name: 'جيم الأبطال', inviteOpen: server.invite !== null }, plan: { maxClients: 40, maxTrainers: 5, expiresAt: 2_000_000_000 }, members });
    }
    if (path === `/api/team/members/${TRAINER.id}`) {
      server.membership = 'active';
      return reply(route, 200, { ok: true });
    }
    if (path === '/api/team/roster') {
      if (token === 'tok-trainer') server.roster = new Uint8Array(req.postDataBuffer() ?? []);
      return reply(route, 200, { ok: true });
    }
    if (path === '/api/team/rosters') {
      return reply(route, 200, { rosters: server.roster ? [{ userId: TRAINER.id, updatedAt: 1_790_000_000, body: Buffer.from(server.roster).toString('base64url') }] : [] });
    }
    return reply(route, 404, { error: 'not_found' });
  });
}

/** Tap ripple drawn by the page itself on every pointer down, so the footage shows each press. */
const RIPPLE = () => {
  addEventListener(
    'pointerdown',
    (e) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(242,92,31,.35);border:2px solid rgba(242,92,31,.9);pointer-events:none;z-index:2147483647;transform:scale(.4);opacity:1;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .55s ease .15s`;
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => {
        d.style.transform = 'scale(1.6)';
        d.style.opacity = '0';
      });
      setTimeout(() => d.remove(), 800);
    },
    true,
  );
};

async function phone(browser) {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: false,
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
  });
  await context.addInitScript(RIPPLE);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await mockWorker(page);
  return { context, page };
}

const browser = await chromium.launch();
const filmed = await phone(browser);
const page = filmed.page;

// Screencast: every painted frame (2× pixels) with its wall-clock time; static moments simply send no frames.
const framesDir = join(out, 'frames');
mkdirSync(framesDir, { recursive: true });
const frames = [];
let cdp = await filmed.context.newCDPSession(page);
let filming = true;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('capture timeout')), ms))]);
// Back-to-back captures at full device pixels (headless screencast ignores the 2× scale). A capture that stalls
// (page reload) is abandoned and the capture session reopened, so filming never freezes.
const camera = (async () => {
  while (filming) {
    try {
      const { data } = await withTimeout(
        cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true, clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: 2 } }),
        1500,
      );
      const file = join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, ms: Date.now() });
    } catch {
      await cdp.detach().catch(() => undefined);
      cdp = await filmed.context.newCDPSession(page).catch(() => cdp);
      await new Promise((r) => setTimeout(r, 30));
    }
  }
})();
const t0 = Date.now();
const events = [];
const at = () => Date.now() - t0;
const scene = (caption) => events.push({ type: 'scene', t: at(), caption });
const cut = { start: (why) => events.push({ type: 'cutStart', t: at(), why }), end: () => events.push({ type: 'cutEnd', t: at() }) };
const pause = (ms) => page.waitForTimeout(ms);

/** Clicks the centre of a locator like a person: move, short pause, press. Logs the tap for the camera. */
async function tap(locator, { zoom = true, hold = 650 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('tap target not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  events.push({ type: 'tap', t: at(), x, y, zoom });
  await page.mouse.move(x, y, { steps: 6 });
  await pause(120);
  await page.mouse.click(x, y);
  await pause(hold);
}

async function typeInto(locator, text) {
  await tap(locator, { zoom: false, hold: 150 });
  await locator.pressSequentially(text, { delay: 45 });
}

async function glide(dy, steps = 18) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await pause(22);
  }
}

try {
  // 1. Sign in (the account server is mocked in the browser).
  cut.start('boot');
  await page.goto(`${APP}/?standalone=1&worker=${encodeURIComponent(WORKER)}`);
  await page.getByRole('heading', { name: 'أهلاً بيك' }).waitFor();
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  cut.end();
  scene('دخول بالإيميل أو بحساب جوجل');
  await pause(900);
  await typeInto(page.getByLabel('الإيميل'), MANAGER.email);
  await typeInto(page.getByLabel('كلمة السر', { exact: true }), 'demo-pass-1');
  await pause(300);
  await tap(page.getByRole('button', { name: 'دخول', exact: true }), { hold: 1200 });

  // 2. First run: the name comes from the account.
  scene('اسمك جاهز من حسابك');
  await page.getByText('خطوة 1 من 4').waitFor();
  await pause(900);
  await tap(page.getByRole('button', { name: 'بعدين' }), { hold: 1200 });

  // 3. Home.
  scene('يومك كله في شاشة واحدة');
  await page.getByRole('heading', { name: 'باقي اليوم' }).waitFor();
  await pause(1100);
  await glide(520);
  await pause(700);
  await glide(-520);
  await pause(300);

  // 4. Clients → a client.
  scene('عملاءك وباقاتهم');
  await tap(page.getByRole('link', { name: 'العملاء', exact: true }), { hold: 1000 });
  await tap(page.getByRole('link', { name: /سارة محمود/ }), { hold: 1100 });
  await glide(640);
  await pause(700);
  await glide(-640);
  await pause(300);

  // 5. Schedule.
  await tap(page.getByRole('link', { name: 'رجوع للعملاء' }), { zoom: false, hold: 700 });
  scene('مواعيد الأسبوع');
  await tap(page.getByRole('link', { name: 'المواعيد', exact: true }), { hold: 1500 });

  // 6. Gym: Team screen, invite link.
  scene('الجيم بيضيف مدربينه بلينك');
  await tap(page.getByRole('link', { name: 'الرئيسية', exact: true }), { zoom: false, hold: 700 });
  await tap(page.getByRole('button', { name: 'المزيد والإعدادات' }), { hold: 900 });
  await tap(page.getByRole('link', { name: /الفريق/ }), { hold: 1200 });
  await tap(page.getByRole('button', { name: 'اعمل لينك دعوة' }), { hold: 1400 });
  const link = (await page.getByTestId('team-invite-link').textContent()) ?? '';

  // Off camera: a trainer opens the link on their own phone and signs in.
  cut.start('trainer joins');
  const trainer = await phone(browser);
  await trainer.page.goto(`${APP}/?standalone=1&worker=${encodeURIComponent(WORKER)}${new URL(link).hash}`);
  await trainer.page.getByLabel('الإيميل').fill(TRAINER.email);
  await trainer.page.getByLabel('كلمة السر', { exact: true }).fill('demo-pass-2');
  await trainer.page.getByRole('button', { name: 'دخول', exact: true }).click();
  await trainer.page.getByRole('heading', { name: 'مستني موافقة جيم الأبطال' }).waitFor();
  await page.reload();
  await page.getByText('مستنيين موافقتك').waitFor();
  await page.evaluate(() => document.fonts.ready);
  cut.end();

  // 7. Approve the trainer.
  scene('توافق على المدرب بضغطة');
  await pause(500);
  await glide(700);
  await pause(400);
  await tap(page.getByRole('button', { name: 'وافق' }), { hold: 1000 });

  // Off camera: the trainer's app opens and sends its encrypted client summary.
  cut.start('trainer uploads');
  await trainer.page.getByRole('button', { name: 'اتأكد تاني' }).click();
  await trainer.page.getByRole('button', { name: 'بعدين' }).click();
  for (let i = 0; i < 60 && !server.roster; i++) await trainer.page.waitForTimeout(250);
  await page.reload();
  await page.getByText(TRAINER.name).waitFor();
  await page.evaluate(() => document.fonts.ready);
  cut.end();

  // 8. The gym sees the trainer's clients (decrypted on this phone only).
  scene('وتشوف عملاء كل مدرب، متشفّرين');
  await pause(400);
  await glide(900);
  await pause(300);
  await tap(page.getByText(TRAINER.name), { hold: 900 });
  await glide(420);
  await pause(1800);

  // 9. Settings: the account.
  scene('حسابك، وخطتك، وخروج آمن');
  await page.goto(`${APP}/more/settings?standalone=1`);
  await page.getByText(MANAGER.email).waitFor();
  await pause(500);
  await glide(500);
  await pause(1600);
  await trainer.context.close();
} catch (error) {
  await page.screenshot({ path: join(out, 'error.png') }).catch(() => undefined);
  throw error;
} finally {
  const total = at();
  filming = false;
  await camera;
  writeFileSync(join(out, 'events.json'), JSON.stringify({ view: VIEW, events, total }, null, 2));
  await filmed.context.close();
  await browser.close();
  // Frames → constant 30 fps video on the same clock as events.json (each frame lasts until the next one).
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const start = Math.max(0, f.ms - t0);
    const next = i + 1 < frames.length ? Math.max(0, frames[i + 1].ms - t0) : total;
    if (i === 0 && start > 0) lines.push(`file '${f.file}'`, `duration ${(start / 1000).toFixed(3)}`);
    lines.push(`file '${f.file}'`, `duration ${(Math.max(1, next - start) / 1000).toFixed(3)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  writeFileSync(join(out, 'frames.ffconcat'), lines.join('\n'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(out, 'frames.ffconcat'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', join(out, 'raw.mp4')]);
}
console.log(`recorded ${out}/raw.mp4 (${frames.length} frames) with ${events.length} events`);
