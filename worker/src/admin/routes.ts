import { MAX_FORM_BODY_BYTES, readLimitedText } from '../http';
import type { Deps, LicenseRecord } from '../ports';
import { RULES } from '../rateLimit';
import { codeIssuedPage, confirmPage, dashboardPage, loginPage, messagePage, DURATION_OPTIONS } from './html';
import { clearSessionCookie, createSessionCookie, hasValidSession } from './session';

const DAY = 86_400;
const LIST_LIMIT = 500;
const MAX_NAME_LENGTH = 100;
const DEFAULT_WINDOW_DAYS = 14;

export interface AdminHooks {
  /** Optional housekeeping on dashboard load (deletes old rate-limit windows). */
  prune?: (now: number) => Promise<void>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', ...extra } });
}

/** Defence in depth next to SameSite=Strict: a form POST must come from this same origin. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return origin === null || origin === new URL(request.url).origin;
}

async function readForm(request: Request): Promise<URLSearchParams | null> {
  const text = await readLimitedText(request, MAX_FORM_BODY_BYTES);
  return text === null ? null : new URLSearchParams(text);
}

function parseWindowDays(value: string | null): number | null {
  const days = Number(value ?? DEFAULT_WINDOW_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : null;
}

function parseDuration(value: string | null): { ok: true; days: number | null } | { ok: false } {
  const option = DURATION_OPTIONS.find((o) => o.value === value);
  if (option === undefined) return { ok: false };
  return { ok: true, days: option.value === 'lifetime' ? null : Number(option.value) };
}

async function issueCode(
  deps: Deps,
  input: { name: string; durationDays: number | null; windowDays: number; expiresAt: number | null; feat: string[] },
): Promise<{ code: string; record: LicenseRecord }> {
  const now = deps.now();
  for (let attempt = 0; ; attempt++) {
    const code = deps.newCode();
    const record: LicenseRecord = {
      lid: deps.newId(),
      codeHash: await deps.crypto.hashCode(code),
      customerName: input.name,
      durationDays: input.durationDays,
      actBy: now + input.windowDays * DAY,
      status: 'issued',
      deviceFp: null,
      createdAt: now,
      activatedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedBy: null,
      feat: input.feat,
    };
    try {
      await deps.store.insert(record);
      await deps.store.audit('code_issued', record.lid, now);
      return { code, record };
    } catch (error) {
      if (attempt >= 2) throw error; // a duplicate code hash is astronomically unlikely; retry a couple of times
    }
  }
}

async function handleLogin(request: Request, deps: Deps, clientKey: string): Promise<Response> {
  const now = deps.now();
  const allowed =
    (await deps.limiter.hit(RULES.login, clientKey, now)) && (await deps.limiter.hit(RULES.loginGlobal, 'all', now));
  if (!allowed) return html(loginPage('محاولات كتير. استنى ربع ساعة وجرّب تاني.'), 429);
  const form = await readForm(request);
  const password = form?.get('password') ?? '';
  if (!(await deps.crypto.passwordMatches(password))) {
    await deps.store.audit('login_failed', null, now);
    return html(loginPage('كلمة السر غلط.'), 401);
  }
  await deps.store.audit('login_ok', null, now);
  return redirect('/admin', { 'Set-Cookie': await createSessionCookie(deps.crypto, now) });
}

async function handleGenerate(request: Request, deps: Deps): Promise<Response> {
  const form = await readForm(request);
  const name = (form?.get('name') ?? '').trim();
  const duration = parseDuration(form?.get('duration') ?? null);
  const windowDays = parseWindowDays(form?.get('window') ?? null);
  if (name === '' || name.length > MAX_NAME_LENGTH || !duration.ok || windowDays === null) {
    return html(messagePage('بيانات ناقصة', 'اكتب اسم العميل، واختار المدة، ومهلة التفعيل من 1 لـ 365 يوم.'), 400);
  }
  const { code, record } = await issueCode(deps, {
    name,
    durationDays: duration.days,
    windowDays,
    expiresAt: null,
    feat: ['core'],
  });
  return html(codeIssuedPage({ code, name, actBy: record.actBy, durationDays: record.durationDays, moved: false }));
}

async function handleLicenseAction(request: Request, deps: Deps, action: 'move' | 'revoke'): Promise<Response> {
  const form = await readForm(request);
  const lid = form?.get('lid') ?? '';
  const record = lid === '' ? null : await deps.store.findById(lid);
  if (record === null) return html(messagePage('مش موجود', 'الترخيص ده مش موجود.'), 404);
  if (record.status !== 'issued' && record.status !== 'active') {
    return html(messagePage('خلاص', 'الترخيص ده متلغي أو متنقل قبل كده.'), 409);
  }
  if (form?.get('confirmed') !== 'yes') return html(confirmPage(action, record));

  const now = deps.now();
  if (action === 'revoke') {
    await deps.store.end(record.lid, 'revoked', now, null);
    await deps.store.audit('revoked', record.lid, now);
    return redirect('/admin?done=revoked');
  }

  const windowDays = parseWindowDays(form.get('window'));
  if (windowDays === null) return html(messagePage('بيانات ناقصة', 'مهلة التفعيل لازم تكون من 1 لـ 365 يوم.'), 400);
  // Keep the customer's remaining time: an active time-limited license carries its expiry over.
  const carriedExpiry = record.status === 'active' ? record.expiresAt : null;
  const { code, record: next } = await issueCode(deps, {
    name: record.customerName,
    durationDays: record.durationDays,
    windowDays,
    expiresAt: carriedExpiry,
    feat: record.feat,
  });
  if (!(await deps.store.end(record.lid, 'replaced', now, next.lid))) {
    await deps.store.end(next.lid, 'revoked', now, null);
    return html(messagePage('خلاص', 'الترخيص ده اتغيّر في نفس اللحظة. افتح اللوحة تاني.'), 409);
  }
  await deps.store.audit('moved', record.lid, now);
  return html(
    codeIssuedPage({ code, name: record.customerName, actBy: next.actBy, durationDays: next.durationDays, moved: true }),
  );
}

const NOTICES: Record<string, string> = { revoked: 'الترخيص اتلغى.' };

export async function handleAdmin(request: Request, deps: Deps, clientKey: string, hooks: AdminHooks = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const method = request.method;
  const now = deps.now();

  if (method === 'POST' && !sameOrigin(request)) return html(messagePage('ممنوع', 'الطلب ده جاي من مكان غريب.'), 403);
  if (method === 'POST' && path === '/admin/login') return handleLogin(request, deps, clientKey);

  if (!(await deps.limiter.hit(RULES.admin, clientKey, now))) return html(messagePage('استنى شوية', 'طلبات كتير.'), 429);

  const authed = await hasValidSession(request, deps.crypto, now);
  if (method === 'POST' && path === '/admin/logout') return redirect('/admin', { 'Set-Cookie': clearSessionCookie() });
  if (!authed) return method === 'GET' && path === '/admin' ? html(loginPage(null)) : redirect('/admin');

  if (method === 'GET' && path === '/admin') {
    await hooks.prune?.(now);
    const notice = NOTICES[url.searchParams.get('done') ?? ''] ?? null;
    return html(dashboardPage(await deps.store.list(LIST_LIMIT), now, notice));
  }
  if (method === 'POST' && path === '/admin/codes') return handleGenerate(request, deps);
  if (method === 'POST' && path === '/admin/licenses/revoke') return handleLicenseAction(request, deps, 'revoke');
  if (method === 'POST' && path === '/admin/licenses/move') return handleLicenseAction(request, deps, 'move');
  return html(messagePage('مش موجود', 'الصفحة دي مش موجودة.'), 404);
}
