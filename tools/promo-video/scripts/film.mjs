// Films the real app frame by frame. Output: footage/<clip>/NNNN.jpg + meta.json {frames, taps, marks}.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(process.argv[2]);
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const B = 'http://localhost:4400';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ASSETS = path.join(HERE, '..', 'assets');
fs.mkdirSync(ROOT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'ar-EG', timezoneId: 'Africa/Cairo', colorScheme: 'dark', acceptDownloads: true,
});
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
await ctx.addInitScript(() => {
  const css = 'section[aria-labelledby="demo-title"]{display:none!important} *{caret-color:transparent}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
});

// ---- network mocks: client page (worker) and Groq ----
const shareStore = {};
await ctx.route(/workers\.dev/, async (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (r.method() === 'PUT' && u.pathname.startsWith('/api/share/')) { shareStore[u.pathname] = r.postDataBuffer(); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (r.method() === 'GET' && u.pathname.startsWith('/api/share/') && !u.pathname.endsWith('/checkins') && shareStore[u.pathname]) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: shareStore[u.pathname] });
  if (u.pathname.startsWith('/c/')) {
    const id = u.pathname.slice(3); const out = path.join(ROOT, 'viewer.html');
    execFileSync('node', [path.join(HERE, 'viewer-gen.mjs'), out, id]);
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(out) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"checkins":[]}' });
});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
await ctx.route(/api\.groq\.com/, async (route) => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(r.postData() || '{}');
  const msgs = body.messages || []; const last = msgs[msgs.length - 1] || {};
  const reply = (message) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'x', object: 'chat.completion', model: body.model, choices: [{ index: 0, finish_reason: message.tool_calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: null, ...message } }] }) });
  if (body.max_tokens === 1) return reply({ content: 'ok' });
  await new Promise((res) => setTimeout(res, 600));
  if (last.role === 'user') return reply({ tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_clients', arguments: JSON.stringify({ query: 'سارة' }) } }] });
  if (last.role === 'tool' && last.tool_call_id === 'c1') {
    const id = (String(last.content).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [''])[0];
    return reply({ content: 'لقيت سارة محمود. جهزتلك الحجز، أكّد وأنا أسجله:', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'book_session', arguments: JSON.stringify({ clientId: id, date: '2026-11-19', time: '08:00', durationMin: 60 }) } }] });
  }
  return reply({ content: 'تمام، اتحجزت حصة سارة بكرة الساعة 8 الصبح ✅' });
});

const page = await ctx.newPage();
page.setDefaultTimeout(20000);

// ---- recorder ----
class Rec {
  constructor(p) { this.p = p; }
  begin(name) { this.name = name; this.dir = path.join(ROOT, name); fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true }); this.frames = []; this.taps = []; this.marks = []; this.n = 0; }
  async cap() { const f = String(this.n++).padStart(4, '0') + '.jpg'; await this.p.screenshot({ path: path.join(this.dir, f), type: 'jpeg', quality: 88 }); this.frames.push(f); }
  dup(k) { const l = this.frames[this.frames.length - 1]; for (let i = 0; i < k; i++) this.frames.push(l); }
  async hold(sec, settle = 350) { await this.p.waitForTimeout(settle); await this.p.evaluate(() => document.fonts.ready); await this.cap(); this.dup(Math.max(0, Math.round(sec * 30) - 1)); }
  async burst(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) await this.cap(); }
  async scroller(sel) {
    return this.p.evaluateHandle((sel) => {
      if (sel) { const e = document.querySelector(sel); if (e) return e; }
      const dlg = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.offsetParent !== null);
      const scope = dlg.length ? dlg[dlg.length - 1] : document;
      let best = null;
      for (const el of scope.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 5 && el.clientHeight > 250 && (!best || el.clientHeight > best.clientHeight)) best = el;
      }
      if (best) return best;
      return document.scrollingElement;
    }, sel || null);
  }
  async scroll(to, sec, sel) {
    const h = await this.scroller(sel);
    const [y0, max] = await h.evaluate((e) => [e.scrollTop, e.scrollHeight - e.clientHeight]);
    let y1;
    if (to === 'bottom') y1 = max; else if (typeof to === 'number') y1 = to;
    else { const bb = await to.boundingBox(); y1 = y0 + (bb ? bb.y - 140 : 0); }
    y1 = Math.max(0, Math.min(max, y1));
    const n = Math.max(2, Math.round(sec * 30));
    for (let i = 1; i <= n; i++) {
      const t = i / n; const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      await h.evaluate((el, y) => { el.scrollTo({ top: y, behavior: 'instant' }); }, y0 + (y1 - y0) * e);
      await this.cap();
    }
  }
  async tap(loc, after = 0.5, { force = false } = {}) {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const bb = await loc.boundingBox();
    await this.cap();
    if (bb) this.taps.push({ f: this.frames.length - 1, x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    this.dup(6);
    await loc.click({ force });
    await this.burst(after);
  }
  async type(loc, text, { tap = true } = {}) {
    if (tap) await this.tap(loc, 0.15); else await loc.click();
    for (const ch of text) { await this.p.keyboard.type(ch); await this.cap(); this.dup(1); }
  }
  async mark(id, loc) { const bb = await loc.boundingBox(); if (bb) this.marks.push({ id, f: this.frames.length, ...bb }); }
  end() { fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify({ frames: this.frames, taps: this.taps, marks: this.marks, w: 390, h: 844 })); console.log(`clip ${this.name}: ${this.frames.length} frames (${(this.frames.length / 30).toFixed(1)}s), ${this.n} unique`); }
}
const rec = new Rec(page);
const nav = () => page.getByRole('navigation', { name: 'التنقل الرئيسي' });
const go = async (u) => { await page.goto(B + u + (u.includes('?') ? '&' : '?') + 'standalone=1'); await page.waitForTimeout(700); };
const openClient = async (name = 'سارة محمود') => { await go('/clients'); await page.locator('main a[href^="/clients/"]').filter({ hasText: name }).first().waitFor(); };
const tabBtn = (name) => page.getByRole('tab', { name }).or(page.getByRole('link', { name, exact: true })).first();
async function putMeta(key, value) {
  await page.evaluate(async ([key, value]) => {
    for (const d of await indexedDB.databases()) {
      const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = rej; });
      if (db.objectStoreNames.contains('meta')) await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key, value }); tx.oncomplete = res; tx.onerror = rej; });
      db.close();
    }
  }, [key, value]);
}

const clips = {
  async activate() {
    await page.goto(B + '/?standalone=1');
    const code = page.getByLabel('كود التفعيل'); await code.waitFor();
    await rec.hold(1.2);
    await rec.type(code, 'ABCDEFGHJKMN');
    await rec.hold(0.4, 100);
    await rec.tap(page.getByRole('button', { name: 'تفعيل', exact: true }), 0.6);
    await page.getByRole('button', { name: 'التالي' }).waitFor();
    await rec.hold(0.8);
    await rec.type(page.getByRole('textbox').first(), 'كابتن مازن');
    await rec.hold(0.6, 100);
    for (let step = 2; step <= 4; step++) {
      await rec.tap(page.getByRole('button', { name: /التالي|ابدأ|يلا/ }).last(), 0.4);
      await rec.hold(0.7);
      const file = page.locator('input[type=file]');
      if (await file.count()) { await file.first().setInputFiles(path.join(ASSETS, 'logo.png')); await page.waitForTimeout(900); await rec.hold(1.4); }
      const teal = page.getByRole('radio').nth(3).locator('xpath=..');
      if (step === 3 && await teal.count()) { await rec.tap(teal, 0.5).catch(() => {}); await rec.hold(0.8); await rec.tap(page.getByRole('radio').first().locator('xpath=..'), 0.5).catch(() => {}); await rec.hold(0.6); }
      const close = page.getByRole('dialog').getByRole('button', { name: 'إغلاق' });
      if (await close.isVisible().catch(() => false)) { await rec.hold(1.6); await rec.tap(close, 0.4); }
      if (await nav().isVisible().catch(() => false)) break;
    }
    for (let k = 0; k < 3 && !(await nav().isVisible().catch(() => false)); k++) {
      const close = page.getByRole('dialog').getByRole('button', { name: 'إغلاق' });
      if (await close.isVisible().catch(() => false)) { await rec.tap(close, 0.4); continue; }
      const nx = page.getByRole('button', { name: /التالي|ابدأ|يلا|خلّص|تمام/ }).last();
      if (await nx.isVisible().catch(() => false)) await rec.tap(nx, 0.5);
    }
    await nav().waitFor();
    await rec.hold(1.5);
  },
  async home() {
    await go('/'); await nav().waitFor();
    await rec.hold(2.2);
    await rec.scroll(page.getByRole('heading', { name: /رسايل النهارده/ }), 1.6);
    await rec.hold(1.6);
    await rec.scroll('bottom', 3.2);
    await rec.hold(1.2);
    await rec.scroll(0, 1.0);
  },
  async client() {
    await go('/');
    await rec.hold(0.5);
    await rec.tap(nav().getByRole('link', { name: 'العملاء' }), 0.5);
    await rec.hold(1.4);
    await rec.tap(page.locator('main a[href^="/clients/"]').filter({ hasText: 'سارة محمود' }).first(), 0.6);
    await rec.hold(2.0);
    await rec.scroll(500, 1.6);
    await rec.hold(1.4);
    await rec.scroll('bottom', 2.4);
    await rec.hold(1.0);
    await rec.scroll(0, 0.8);
    for (const tab of ['الحصص', 'الفلوس']) { await rec.tap(tabBtn(tab), 0.4).catch(() => {}); await rec.hold(1.6); }
  },
  async program() {
    await openClient(); await page.locator('main a[href^="/clients/"]').filter({ hasText: 'سارة محمود' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'سارة محمود' }).waitFor();
    await rec.tap(tabBtn('التمرين'), 0.4);
    await rec.hold(1.0);
    await rec.tap(page.getByRole('button', { name: /ملف التمرين/ }), 0.6);
    const d = page.getByRole('dialog');
    await rec.hold(0.6);
    await rec.tap(d.getByText('جيم', { exact: true }), 0.2);
    await rec.tap(d.getByText('متوسط', { exact: true }), 0.2);
    await rec.tap(d.getByText('ركبة', { exact: true }), 0.3);
    await d.getByRole('combobox').first().selectOption({ label: 'حرق دهون' });
    await rec.tap(d.getByText('4', { exact: true }).first(), 0.2);
    await rec.tap(d.getByText('60 دقيقة', { exact: true }), 0.2);
    await rec.hold(1.0);
    await rec.tap(d.getByRole('button', { name: 'حفظ' }), 0.5);
    await rec.hold(0.6);
    await rec.tap(page.getByRole('button', { name: 'اعمل برنامج مناسب' }), 0.8);
    await page.getByRole('button', { name: 'خيارات البرنامج' }).waitFor();
    await rec.hold(2.2);
    await rec.scroll(700, 2.4);
    await rec.hold(0.8);
    await rec.scroll('bottom', 2.4);
    await rec.hold(2.0);
    await rec.scroll(0, 0.8);
    await rec.tap(page.getByRole('button', { name: /لور بادي/ }).first(), 0.5).catch(() => {});
    await rec.hold(1.4);
  },
  async session() {
    await rec.tap(page.getByRole('button', { name: 'خيارات البرنامج' }), 0.4);
    await rec.hold(0.6);
    await rec.tap(page.getByRole('button', { name: 'ابدأ حصة باليوم ده' }), 0.6);
    await page.getByRole('button', { name: 'خلّصت السيت' }).waitFor();
    await rec.hold(1.8);
    await rec.tap(page.getByRole('button', { name: 'خلّصت السيت' }), 0.4);
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(700); await rec.cap(); rec.dup(14); }
    await rec.hold(0.8);
  },
  async library() {
    await go('/');
    await rec.tap(nav().getByRole('link', { name: 'التمارين' }), 0.5);
    await rec.hold(1.6);
    await rec.scroll(900, 2.0);
    await rec.scroll(0, 0.8);
    await rec.type(page.getByRole('searchbox').or(page.getByLabel('دوّر على تمرين')).first(), 'سكوات');
    await rec.hold(1.6);
    await rec.tap(page.getByRole('button', { name: 'الفلاتر' }), 0.5);
    await rec.hold(2.0);
    await rec.tap(page.getByRole('button', { name: 'إلغاء' }).or(page.getByText('إلغاء', { exact: true })).first(), 0.4).catch(async () => { await page.keyboard.press('Escape'); });
    await rec.tap(page.locator('main a[href*="/exercises/"]').first(), 0.6);
    await rec.hold(2.0);
    await rec.scroll(560, 1.8);
    await rec.hold(1.6);
    await rec.scroll(1300, 1.6);
    await rec.hold(1.6);
  },
  async calc() {
    await openClient(); await page.locator('main a[href^="/clients/"]').filter({ hasText: 'سارة محمود' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'سارة محمود' }).waitFor();
    await rec.tap(tabBtn('الأكل'), 0.4);
    await rec.hold(0.8);
    await rec.tap(page.getByRole('button', { name: 'احسب السعرات' }).or(page.getByRole('link', { name: 'احسب السعرات' })).first(), 0.6);
    await rec.hold(1.2);
    await rec.type(page.getByLabel('السن'), '30');
    await rec.tap(page.getByText('احسب نسبة الدهون بالمقاسات'), 0.4);
    await rec.scroll(page.getByLabel('الرقبة'), 0.9);
    await rec.type(page.getByLabel('الرقبة'), '34');
    const hip = page.getByLabel('الهيب');
    if (await hip.count()) await rec.type(hip, '100');
    await rec.hold(1.6);
    await rec.scroll(page.getByRole('heading', { name: 'المعادلة' }), 1.4);
    await rec.hold(1.2);
    await rec.scroll(page.getByRole('heading', { name: 'النتيجة' }), 1.6);
    await rec.hold(2.6);
    await rec.tap(page.getByRole('button', { name: 'حفظ للعميل' }), 0.6);
    await rec.hold(0.6);
  },
  async diet() {
    await rec.tap(page.getByRole('link', { name: 'الوجبات' }), 0.5);
    await rec.hold(0.8);
    await page.getByRole('button', { name: 'اعمل دايت أسبوع' }).scrollIntoViewIfNeeded();
    await rec.tap(page.getByRole('button', { name: 'اعمل دايت أسبوع' }), 0.5);
    await page.getByText('بنجهّز').first().waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await rec.hold(2.2);
    await rec.scroll(900, 2.6);
    await rec.hold(1.6);
    await rec.scroll(page.getByText('مجموع اليوم').first(), 2.0).catch(() => {});
    await rec.hold(1.8);
    await rec.scroll(2600, 3.0);
    await rec.hold(1.8);
    await rec.scroll(3800, 2.4);
    await rec.hold(1.4);
    await rec.scroll('bottom', 2.4);
    await rec.hold(1.0);
    await rec.tap(page.getByRole('button', { name: /احفظ كخطة للعميل/ }), 0.6);
    await rec.hold(1.4);
  },
  async recipes() {
    await go('/more/recipes');
    await rec.hold(1.6);
    await rec.tap(page.getByRole('button', { name: 'تنشيف', exact: true }).or(page.getByText('تنشيف', { exact: true })).first(), 0.5).catch(() => {});
    await rec.hold(1.0);
    await rec.scroll(1400, 3.0);
    await rec.hold(0.8);
    await rec.scroll(0, 0.8);
    await rec.tap(page.locator('main a, main [role=button]').filter({ hasText: /سعر/ }).first(), 0.6).catch(() => {});
    await rec.hold(2.0);
    await rec.scroll('bottom', 2.4);
    await rec.hold(1.4);
  },
  async progress() {
    await openClient(); await page.locator('main a[href^="/clients/"]').filter({ hasText: 'سارة محمود' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'سارة محمود' }).waitFor();
    await rec.tap(tabBtn('التقدم'), 0.4);
    await rec.hold(1.0);
    await rec.tap(page.getByRole('button', { name: 'سجّل قياس' }).or(page.getByRole('link', { name: 'سجّل قياس' })).first(), 0.6);
    await rec.hold(0.8);
    if (!(await page.getByRole('dialog').isVisible().catch(() => false))) { await rec.tap(page.getByRole('button', { name: 'قياس جديد' }), 0.5); await rec.hold(0.6); }
    const fill = async (label, v) => { const l = page.getByRole('dialog').getByLabel(new RegExp('^' + label)); if (await l.count()) await rec.type(l.first(), v); };
    await fill('الوزن', '72.5'); await fill('الوسط', '79'); await fill('الرقبة', '33'); await fill('الهيب', '98');
    await rec.hold(1.6);
    const save = page.getByRole('button', { name: 'حفظ', exact: true }).last();
    await rec.tap(save, 0.6);
    await rec.hold(1.6);
    const charts = page.getByRole('link', { name: 'الرسم والصور' }).or(page.getByRole('button', { name: 'الرسم والصور' })).first();
    if (await charts.count()) { await rec.tap(charts, 0.6); await rec.hold(2.0); await rec.scroll('bottom', 2.4); await rec.hold(1.4); }
  },
  async schedule() {
    await go('/');
    await rec.tap(nav().getByRole('link', { name: 'المواعيد' }), 0.5);
    await rec.hold(1.8);
    await rec.tap(page.getByRole('button', { name: 'حضر' }).nth(1), 0.6);
    await rec.hold(2.0);
    await rec.tap(page.getByRole('tab', { name: 'أسبوع' }).or(page.getByText('أسبوع', { exact: true })).first(), 0.5).catch(() => {});
    await rec.hold(1.8);
  },
  async income() {
    await go('/more/income');
    await rec.hold(2.2);
    await rec.scroll('bottom', 2.2);
    await rec.hold(1.4);
  },
  async pdf() {
    await go('/more/pdf');
    await rec.hold(1.0);
    const sel = page.getByRole('combobox').first();
    const opts = await sel.locator('option').allInnerTexts();
    const sara = opts.find((o) => o.includes('سارة'));
    if (sara) { await rec.tap(sel, 0.2); await sel.selectOption({ label: sara }); await rec.hold(1.0); }
    await rec.scroll('bottom', 2.4);
    await rec.hold(1.0);
    const dl = page.waitForEvent('download', { timeout: 180000 });
    await rec.tap(page.getByRole('button', { name: /اعمل الملف/ }), 1.0);
    await page.getByRole('button', { name: 'نزّل الملف' }).waitFor({ timeout: 180000 });
    await rec.hold(0.5);
    await rec.scroll('bottom', 1.2);
    await rec.hold(2.2);
    await rec.tap(page.getByRole('button', { name: 'نزّل الملف' }), 0.5);
    const file = await dl; const out = path.join(ROOT, 'plan.pdf'); await file.saveAs(out);
    await rec.hold(1.4);
    console.log('pdf saved', out);
  },
  async share() {
    await putMeta('license.token', 'eyJ2IjoxfQ.sig');
    await openClient(); await page.locator('main a[href^="/clients/"]').filter({ hasText: 'سارة محمود' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'سارة محمود' }).waitFor();
    await rec.hold(0.6);
    await rec.tap(page.getByRole('button', { name: 'صفحة العميل' }).first(), 0.6);
    await rec.hold(1.6);
    await rec.tap(page.getByRole('button', { name: 'اعمل لينك' }), 0.8);
    await page.getByRole('button', { name: 'انسخ اللينك' }).waitFor();
    await rec.hold(1.8);
    await rec.tap(page.getByRole('button', { name: 'انسخ اللينك' }), 0.4);
    await rec.hold(0.8);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    fs.writeFileSync(path.join(ROOT, 'share-link.txt'), link);
  },
  async viewer() {
    const link = fs.readFileSync(path.join(ROOT, 'share-link.txt'), 'utf8');
    const v = await ctx.newPage();
    const r2 = new Rec(v); r2.begin('viewer');
    await v.goto(link); await v.waitForTimeout(2500);
    await r2.hold(2.2);
    await r2.scroll(500, 1.6); await r2.hold(1.0); await r2.scroll(0, 0.6);
    for (const t of ['تمرينك', 'أكلك', 'تقدّمك', 'متابعة']) {
      const b = v.getByRole('button', { name: t }).or(v.getByRole('tab', { name: t })).or(v.getByText(t, { exact: true })).first();
      if (await b.count()) { await r2.tap(b, 0.5).catch(() => {}); await r2.hold(1.4); await r2.scroll(700, 2.0); await r2.hold(1.2); await r2.scroll(0, 0.5); }
    }
    r2.end(); await v.close();
    return 'skip-end';
  },
  async assistant() {
    await putMeta('backup.ai.apiKey', 'gsk_' + 'a'.repeat(40)); await putMeta('backup.ai.settings', { enabled: true, model: 'llama-3.3-70b-versatile', firstNamesOnly: true, privacyAck: true });
    await go('/more/assistant');
    await rec.hold(1.4);
    const box = page.getByRole('textbox').last();
    await rec.type(box, 'احجز لسارة حصة بكرة الساعة 8 الصبح');
    await rec.hold(0.4, 100);
    await rec.tap(page.getByRole('button', { name: /ابعت|إرسال|send/i }).last(), 0.4);
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(400); await rec.cap(); rec.dup(4); }
    await page.getByRole('button', { name: /أكّد|تأكيد|نفّذ|موافق|تمام/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
    await rec.hold(2.6);
    const ok = page.getByRole('button', { name: /أكّد|تأكيد|نفّذ|موافق|تمام/ }).first();
    if (await ok.count()) { await rec.tap(ok, 0.8); await page.waitForTimeout(1500); await rec.hold(2.4); }
  },
  async backup() {
    await go('/more/settings/backup');
    await rec.hold(2.4);
    await rec.scroll('bottom', 2.0);
    await rec.hold(1.0);
    await go('/more/settings/storage');
    await rec.hold(2.2);
    await rec.scroll('bottom', 2.0);
    await rec.hold(1.2);
  },
  async offline() {
    await ctx.setOffline(true);
    await go('/');
    await rec.hold(1.0);
    await rec.tap(nav().getByRole('link', { name: 'العملاء' }), 0.5);
    await rec.hold(1.0);
    await rec.tap(nav().getByRole('link', { name: 'التمارين' }), 0.5);
    await rec.hold(1.2);
    await ctx.setOffline(false);
  },
  async identity() {
    await go('/more/settings/identity');
    await rec.hold(1.6);
    await rec.scroll(page.getByRole('heading', { name: 'لون الهوية' }), 1.2);
    await rec.hold(0.6);
    const sw = page.getByRole('radio');
    for (const i of [1, 2, 7, 0]) { if (await sw.count() > i) { await rec.tap(sw.nth(i).locator('xpath=..'), 0.4); await rec.hold(0.8); } }
    await rec.scroll('bottom', 2.0);
    await rec.hold(1.0);
  },
  async english() {
    await go('/more/settings');
    await rec.hold(1.0);
    await rec.tap(page.getByText('English', { exact: true }).first(), 0.6);
    await rec.hold(1.2);
    await rec.tap(page.locator('nav a').first(), 0.5);
    await rec.hold(2.0);
    await go('/more/settings');
    await page.getByText('العربية', { exact: true }).first().click();
    await page.waitForTimeout(500);
  },
};

const order = ['activate', 'home', 'client', 'program', 'session', 'library', 'calc', 'diet', 'recipes', 'progress', 'schedule', 'income', 'pdf', 'share', 'viewer', 'assistant', 'backup', 'identity', 'offline', 'english'];
for (const name of order) {
  if (ONLY && !ONLY.includes(name) && name !== 'activate') continue;
  rec.begin(name);
  try {
    const r = await clips[name]();
    if (r !== 'skip-end') rec.end();
  } catch (e) {
    console.log(`!! clip ${name} failed: ${e.message.split('\n').slice(0, 4).join(' | ')}`);
    await page.screenshot({ path: path.join(ROOT, `ERR-${name}.png`) }).catch(() => {});
    if (rec.frames.length > 30) rec.end();
  }
}
await browser.close();
