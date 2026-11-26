import { base64UrlEncode } from '../../../shared/bytes';
import type { AccountRecord } from '../auth/accounts';
import { MIN_PASSWORD_LENGTH } from '../auth/auth';
import { MAX_FORM_BODY_BYTES, readLimitedText } from '../http';
import type { Deps } from '../ports';
import { dropAccountPush } from '../push/cleanup';
import { RULES } from '../rateLimit';
import type { Plan } from '../team/access';
import { endOfCairoDay } from './cairoDate';
import { ADMIN_SCRIPT, confirmPage, dashboardPage, loginPage, messagePage, passwordSetPage, planPage, STATUS_FILTERS, type AccountAction, type RowInfo } from './html';
import { clearSessionCookie, createSessionCookie, hasValidSession, SESSION_COOKIE } from './session';

/** Read cap for the dashboard list; search and paging run over these rows. */
const LIST_LIMIT = 2000;
const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;

export interface AdminHooks {
  /** Optional housekeeping on dashboard load (deletes old rate-limit windows). */
  prune?: (now: number) => Promise<void>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
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

async function handleLogin(request: Request, deps: Deps, clientKey: string): Promise<Response> {
  const now = deps.now();
  const allowed =
    (await deps.limiter.hit(RULES.login, clientKey, now)) && (await deps.limiter.hit(RULES.loginGlobal, 'all', now));
  if (!allowed) return html(loginPage('محاولات كتير. استنى ربع ساعة وجرّب تاني.'), 429);
  const form = await readForm(request);
  const password = form?.get('password') ?? '';
  if (!(await deps.crypto.passwordMatches(password))) {
    await deps.audit.audit('login_failed', null, now);
    return html(loginPage('كلمة السر غلط.'), 401);
  }
  await deps.audit.audit('login_ok', null, now);
  return redirect('/admin', { 'Set-Cookie': await createSessionCookie(deps.crypto, now) });
}

/** Readable random password for "new password": 12 base64url chars (72 bits). */
function suggestPassword(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(9)));
}

const NOTICES: Record<string, string> = {
  plan: 'الخطة اتحفظت.',
  approve: 'الحساب اتوافق عليه. المدرب يقدر يستخدم التطبيق دلوقتي.',
  enable: 'الحساب اشتغل تاني.',
  disable: 'الحساب اتوقف.',
};
const EXPIRED_NOTICE = 'الجلسة خلصت (بتخلص بعد 12 ساعة). ادخل تاني بكلمة السر، وبعدها كرر آخر خطوة لو ما كملتش.';

async function handleAccountAction(request: Request, deps: Deps, action: Exclude<AccountAction, 'plan'>): Promise<Response> {
  const form = await readForm(request);
  const id = form?.get('id') ?? '';
  const record = id === '' ? null : await deps.accounts.find(id);
  if (record === null) return html(messagePage('مش موجود', 'الحساب ده مش موجود.'), 404);
  const now = deps.now();

  if (action === 'approve' || action === 'enable') {
    if (record.status === 'approved') return redirect('/admin');
    await deps.accounts.setStatus(record.id, 'approved');
    await deps.audit.audit(action === 'approve' ? 'approved' : 'enabled', record.id, now);
    return redirect(`/admin?done=${action}`);
  }

  if (form?.get('confirmed') !== 'yes') return html(confirmPage(action, record, suggestPassword()));

  if (action === 'disable') {
    // Sessions stay: the app then learns "disabled" (and locks) instead of just "signed out".
    await deps.accounts.setStatus(record.id, 'disabled');
    await dropAccountPush(deps.cloud.db, record.id);
    await deps.audit.audit('disabled', record.id, now);
    return redirect('/admin?done=disable');
  }

  const password = form.get('password') ?? '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    return html(messagePage('كلمة السر قصيرة', `كلمة السر لازم تكون ${MIN_PASSWORD_LENGTH} حروف على الأقل.`), 400);
  }
  await deps.accounts.setPassword(record.id, password);
  await deps.accounts.endSessions(record.id);
  await deps.audit.audit('password_set', record.id, now);
  return html(passwordSetPage({ record, password, appUrl: deps.config.appOrigins[0] ?? null }));
}

async function showPlan(deps: Deps, id: string): Promise<Response> {
  const record = id === '' ? null : await deps.accounts.find(id);
  if (record === null) return html(messagePage('مش موجود', 'الحساب ده مش موجود.'), 404);
  const [plan, gym] = await Promise.all([deps.team.plan(id), deps.team.gym(id)]);
  return html(planPage(record, plan, gym?.name ?? ''));
}

function parseLimit(value: string | null, max: number): number | null | undefined {
  const text = (value ?? '').trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}

async function savePlan(request: Request, deps: Deps): Promise<Response> {
  const form = await readForm(request);
  const id = form?.get('id') ?? '';
  const record = id === '' ? null : await deps.accounts.find(id);
  if (record === null || form === null) return html(messagePage('مش موجود', 'الحساب ده مش موجود.'), 404);
  const kind = form.get('kind') === 'gym' ? 'gym' : 'trainer';
  const gymName = (form.get('gymName') ?? '').trim().slice(0, 100);
  const maxClients = parseLimit(form.get('maxClients'), 100_000);
  const maxTrainers = parseLimit(form.get('maxTrainers'), 10_000);
  const untilText = (form.get('until') ?? '').trim();
  const expiresAt = untilText === '' ? null : endOfCairoDay(untilText);
  const draft: Plan = { kind, maxClients: maxClients ?? null, maxTrainers: kind === 'gym' ? (maxTrainers ?? null) : null, expiresAt };
  const again = (error: string) => html(planPage(record, draft, gymName, error), 400);
  if (maxClients === undefined || maxTrainers === undefined) return again('الأرقام لازم تكون صحيحة ومن 0 وطالع، أو سيبها فاضية.');
  if (untilText !== '' && expiresAt === null) return again('التاريخ مش مظبوط.');
  if (kind === 'gym' && gymName === '') return again('اكتب اسم الجيم.');
  const now = deps.now();
  const existingGym = await deps.team.gym(id);
  if (kind === 'trainer' && existingGym !== null) {
    if ((await deps.team.members(id)).length > 0) return again('الجيم ده فيه مدربين. شيلهم من التطبيق الأول قبل ما تحوّله لمدرب.');
    await deps.team.deleteGym(id);
  }
  if (kind === 'gym') {
    const membership = await deps.team.membership(id);
    if (membership !== null && membership.status !== 'removed') return again('الحساب ده مدرب تبع جيم تاني. لازم يسيب الجيم الأول.');
    await deps.team.upsertGym(id, gymName, now);
  }
  await deps.team.setPlan(id, draft, now);
  await deps.audit.audit('plan_set', id, now);
  return redirect('/admin?done=plan');
}

function matches(r: AccountRecord, needle: string, status: string): boolean {
  const text = `${r.name} ${r.email}`.toLocaleLowerCase('ar');
  return (needle === '' || text.includes(needle)) && (status === '' || r.status === status);
}

function hasCookie(request: Request, name: string): boolean {
  return (request.headers.get('Cookie') ?? '').split(';').some((part) => part.trim().startsWith(`${name}=`));
}

async function dashboard(url: URL, deps: Deps): Promise<Response> {
  const all = await deps.accounts.list(LIST_LIMIT);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const statusParam = url.searchParams.get('status') ?? '';
  const status = STATUS_FILTERS.some((o) => o.value === statusParam) ? statusParam : '';
  const needle = q.toLocaleLowerCase('ar');
  const found = all.filter((r) => matches(r, needle, status));
  const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
  const requested = Number(url.searchParams.get('page') ?? '1');
  const pageNumber = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), pages) : 1;
  const records = found.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const notice = NOTICES[url.searchParams.get('done') ?? ''] ?? null;
  const ids = records.map((r) => r.id);
  const [plans, allMemberships, trainers] = await Promise.all([deps.team.plans(ids), deps.team.memberships(all.map((r) => r.id)), deps.team.countMembers(ids)]);
  const memberships = allMemberships;
  // Trainers who joined a gym wait for the gym, not for the owner.
  const pending = all.filter((r) => r.status === 'pending' && (allMemberships.get(r.id)?.status ?? 'removed') === 'removed').length;
  const info = new Map<string, RowInfo>(
    ids.map((id) => [id, { plan: plans.get(id) ?? null, membership: memberships.get(id) ?? null, trainers: trainers.get(id) ?? 0 }]),
  );
  return html(
    dashboardPage({ records, info, total: found.length, all: all.length, pending, page: pageNumber, pages, q, status, notice, capped: all.length >= LIST_LIMIT }),
  );
}

export async function handleAdmin(request: Request, deps: Deps, clientKey: string, hooks: AdminHooks = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const method = request.method;
  const now = deps.now();

  if (method === 'GET' && path === '/admin/admin.js') {
    return new Response(ADMIN_SCRIPT, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (method === 'POST' && !sameOrigin(request)) return html(messagePage('ممنوع', 'الطلب ده جاي من مكان غريب.'), 403);
  if (method === 'POST' && path === '/admin/login') return handleLogin(request, deps, clientKey);

  const authed = await hasValidSession(request, deps.crypto, now);
  // Anonymous visitors only ever get the login page or a redirect: count them in memory, so a crawler or a
  // flood cannot spend the D1 daily write budget that accounts and backups depend on. Login has its own
  // durable limit above.
  const limiter = authed ? deps.limiter : deps.localLimiter;
  if (!(await limiter.hit(RULES.admin, clientKey, now))) return html(messagePage('استنى شوية', 'طلبات كتير.'), 429);

  if (method === 'POST' && path === '/admin/logout') return redirect('/admin', { 'Set-Cookie': clearSessionCookie() });
  if (!authed) {
    // A stale cookie or a form posted from an open dashboard means the 12-hour session ran out: say so.
    const expired = hasCookie(request, SESSION_COOKIE) || method === 'POST' || url.searchParams.get('expired') === '1';
    if (method === 'GET' && path === '/admin') return html(loginPage(null, expired ? EXPIRED_NOTICE : null));
    return redirect(expired ? '/admin?expired=1' : '/admin');
  }

  if (method === 'GET' && path === '/admin') {
    await hooks.prune?.(now);
    return dashboard(url, deps);
  }
  if (path === '/admin/accounts/plan' && method === 'GET') return showPlan(deps, url.searchParams.get('id') ?? '');
  if (path === '/admin/accounts/plan' && method === 'POST') return savePlan(request, deps);
  const action = /^\/admin\/accounts\/(approve|disable|enable|password)$/.exec(path)?.[1] as Exclude<AccountAction, 'plan'> | undefined;
  if (method === 'POST' && action !== undefined) return handleAccountAction(request, deps, action);
  return html(messagePage('مش موجود', 'الصفحة دي مش موجودة.'), 404);
}
