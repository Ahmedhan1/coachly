import { base64UrlEncode } from '../../../shared/bytes';
import type { AccountRecord } from '../auth/accounts';
import { MIN_PASSWORD_LENGTH } from '../auth/auth';
import { MAX_FORM_BODY_BYTES, readLimitedText } from '../http';
import type { Deps } from '../ports';
import { dropAccountPush } from '../push/cleanup';
import { RULES } from '../rateLimit';
import type { Plan } from '../team/access';
import { endOfCairoDay } from './cairoDate';
import { accountCard, ADMIN_SCRIPT, confirmPage, dashboardPage, deletePage, loginPage, messagePage, passwordSetPage, planPage, STATUS_FILTERS, type AccountAction, type RowInfo } from './html';
import { deleteAccountData } from './deleteAccount';
import { queryAccounts } from './store';
import { clearSessionCookie, createSessionCookie, hasValidSession, SESSION_COOKIE } from './session';

const PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 100;

export interface AdminHooks {
  /** Optional housekeeping on dashboard load (deletes old rate-limit windows). */
  prune?: (now: number) => Promise<void>;
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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
  delete: 'الحساب اتمسح نهائياً من السيرفر.',
};
const EXPIRED_NOTICE = 'الجلسة خلصت (بتخلص بعد 12 ساعة). ادخل تاني بكلمة السر، وبعدها كرر آخر خطوة لو ما كملتش.';

/** Plan, gym membership and gym size for some accounts, read together. */
async function rowInfo(deps: Deps, ids: readonly string[]): Promise<Map<string, RowInfo>> {
  const [plans, memberships, trainers] = await Promise.all([deps.team.plans(ids), deps.team.memberships(ids), deps.team.countMembers(ids)]);
  return new Map(ids.map((id) => [id, { plan: plans.get(id) ?? null, membership: memberships.get(id) ?? null, trainers: trainers.get(id) ?? 0 }]));
}

/** Quick action from the dashboard script: answer with the account's updated card instead of a redirect. */
async function inlineCard(deps: Deps, id: string): Promise<Response> {
  const record = await deps.accounts.find(id);
  if (record === null) return html('', 404);
  const info = (await rowInfo(deps, [id])).get(id) ?? { plan: null, membership: null, trainers: 0 };
  return html(accountCard(record, info));
}

async function handleDelete(request: Request, deps: Deps): Promise<Response> {
  const form = await readForm(request);
  const id = form?.get('id') ?? '';
  const record = id === '' ? null : await deps.accounts.find(id);
  if (record === null || form === null) return html(messagePage('مش موجود', 'الحساب ده مش موجود.'), 404);
  const gym = await deps.team.gym(id);
  const info = { isGym: gym !== null, gymTrainers: gym === null ? 0 : (await deps.team.members(id)).filter((m) => m.status !== 'removed').length };
  if (form.get('confirmed') !== 'yes') return html(deletePage(record, info));
  const typed = (form.get('email') ?? '').trim().toLowerCase();
  if (typed !== record.email.toLowerCase()) return html(deletePage(record, info, 'الإيميل مش مطابق. اكتبه زي ما هو بالظبط.'), 400);
  await deleteAccountData(deps.cloud, record.id);
  await deps.audit.audit('deleted', record.id, deps.now());
  return redirect('/admin?done=delete');
}

async function handleAccountAction(request: Request, deps: Deps, action: Exclude<AccountAction, 'plan' | 'delete'>): Promise<Response> {
  const inline = request.headers.get('X-Admin-Inline') === '1';
  const form = await readForm(request);
  const id = form?.get('id') ?? '';
  const record = id === '' ? null : await deps.accounts.find(id);
  if (record === null) return html(messagePage('مش موجود', 'الحساب ده مش موجود.'), 404);
  const now = deps.now();

  if (action === 'approve' || action === 'enable') {
    if (record.status !== 'approved') {
      await deps.accounts.setStatus(record.id, 'approved');
      await deps.audit.audit(action === 'approve' ? 'approved' : 'enabled', record.id, now);
    }
    if (inline) return inlineCard(deps, record.id);
    return record.status === 'approved' ? redirect('/admin') : redirect(`/admin?done=${action}`);
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

function hasCookie(request: Request, name: string): boolean {
  return (request.headers.get('Cookie') ?? '').split(';').some((part) => part.trim().startsWith(`${name}=`));
}

async function dashboard(url: URL, deps: Deps): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const statusParam = url.searchParams.get('status') ?? '';
  const status = (STATUS_FILTERS.find((o) => o.value === statusParam)?.value ?? '') as '' | AccountRecord['status'];
  const requested = Number(url.searchParams.get('page') ?? '1');
  let pageNumber = Number.isInteger(requested) && requested > 0 ? requested : 1;
  let result = await queryAccounts(deps.cloud.db, { status, q, limit: PAGE_SIZE, offset: (pageNumber - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  if (pageNumber > pages) {
    pageNumber = pages;
    result = await queryAccounts(deps.cloud.db, { status, q, limit: PAGE_SIZE, offset: (pageNumber - 1) * PAGE_SIZE });
  }
  const info = await rowInfo(deps, result.records.map((r) => r.id));
  const notice = NOTICES[url.searchParams.get('done') ?? ''] ?? null;
  return html(dashboardPage({ records: result.records, info, total: result.total, counts: result.counts, page: pageNumber, pages, q, status, notice }));
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
  if (path === '/admin/accounts/delete' && method === 'POST') return handleDelete(request, deps);
  const action = /^\/admin\/accounts\/(approve|disable|enable|password)$/.exec(path)?.[1] as Exclude<AccountAction, 'plan' | 'delete'> | undefined;
  if (method === 'POST' && action !== undefined) return handleAccountAction(request, deps, action);
  return html(messagePage('مش موجود', 'الصفحة دي مش موجودة.'), 404);
}
