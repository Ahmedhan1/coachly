import type { AccountRecord } from '../auth/accounts';
import type { AccountStatus } from '../auth/auth';
import type { Plan } from '../team/access';
import type { Membership } from '../team/store';

export const STATUS_FILTERS: ReadonlyArray<{ value: '' | AccountStatus; label: string }> = [
  { value: '', label: 'الكل' },
  { value: 'pending', label: 'مستني موافقتك' },
  { value: 'approved', label: 'شغّال' },
  { value: 'disabled', label: 'موقوف' },
];

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(seconds: number | null): string {
  return seconds === null ? '—' : dateFormat.format(new Date(seconds * 1000)).replace(',', '');
}

export function statusLabel(status: AccountStatus): string {
  return STATUS_FILTERS.find((o) => o.value === status)?.label ?? status;
}

function statusTone(status: AccountStatus): string {
  return status === 'approved' ? 'ok' : status === 'pending' ? 'wait' : 'off';
}

const STYLE = `
:root{color-scheme:light dark;--bg:#ededea;--fg:#16181a;--card:#fff;--line:#d6d6d0;--accent:#1d5fd6;--danger:#b42318;--muted:#5b6066;--ok:#1d7a3a;--wait:#8a5a00;--wa:#128c4a}
@media (prefers-color-scheme:dark){:root{--bg:#111315;--fg:#ecedee;--card:#1b1e21;--line:#30353a;--accent:#6ea2ff;--danger:#f07167;--muted:#9aa1a8;--ok:#5fcf86;--wait:#e3b04b;--wa:#3ccf7d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:1040px;margin:0 auto;padding:16px}h1{font-size:1.4rem;margin:8px 0 16px}h2{font-size:1.1rem;margin-block-start:0}
a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-block-end:16px}
label{display:block;margin-block-end:12px}input,select,textarea{display:block;width:100%;max-width:420px;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);min-height:44px}
textarea{max-width:none;min-height:180px;resize:vertical}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:600;min-height:44px;padding:8px 16px;border-radius:8px;border:0;background:var(--accent);color:#fff;cursor:pointer;text-decoration:none}
button.danger{background:var(--danger)}button.quiet{background:transparent;color:var(--accent);border:1px solid var(--line)}button.link{background:none;color:var(--accent);padding:0 8px}
.btn.wa{background:var(--wa)}
.code{font:700 2rem/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;direction:ltr;unicode-bidi:isolate;user-select:all;padding:12px 16px;border:2px dashed var(--accent);border-radius:12px;display:inline-block}
.ltr{direction:ltr;unicode-bidi:isolate}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.muted{color:var(--muted)}.error{color:var(--danger);font-weight:600}.notice{border-color:var(--accent)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-block:12px}
.copied{color:var(--ok);font-weight:600;min-width:4em}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.85rem;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.pill.ok{color:var(--ok)}.pill.wait{color:var(--wait)}.pill.off{color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{text-align:start;padding:8px;border-block-end:1px solid var(--line);vertical-align:top}
td.acts{white-space:nowrap}td form{display:inline-block;margin-inline-end:8px;margin-block-end:4px}
.top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-block-end:12px}.filters label{margin:0;flex:1 1 180px}
.pager{display:flex;gap:12px;align-items:center;justify-content:center;margin-block-start:12px}
ol.steps{padding-inline-start:1.4em;margin:8px 0}
@media (max-width:720px){
 table,thead,tbody,tr,td{display:block}thead{display:none}
 tr{border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-block-end:12px}
 td{border:0;padding:4px 0;display:flex;gap:8px;justify-content:space-between}
 td::before{content:attr(data-label);color:var(--muted);flex:none}
 td.name{font-weight:700;font-size:1.05rem}td.name::before{content:none}
 td.acts{justify-content:flex-start;flex-wrap:wrap}td.acts::before{content:none}
 .code{font-size:1.6rem}
}
`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style>
<script src="/admin/admin.js" defer></script></head>
<body><main>${body}</main></body></html>`;
}

/**
 * The only script on the admin pages (served as a file so the CSP stays `script-src 'self'`): copy buttons
 * with a fallback for browsers without the async clipboard API.
 */
export const ADMIN_SCRIPT = `document.addEventListener('click',function(e){
var b=e.target&&e.target.closest?e.target.closest('[data-copy]'):null;if(!b)return;
var el=document.getElementById(b.getAttribute('data-copy'));if(!el)return;
var text=el.value!==undefined&&el.tagName==='TEXTAREA'?el.value:el.textContent;
var out=document.getElementById(b.getAttribute('data-copy')+'-copied');
function ok(){if(out){out.textContent='اتنسخ';setTimeout(function(){out.textContent='';},2500);}}
function fallback(){var t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(_){}document.body.removeChild(t);}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(ok,fallback);}else{fallback();}
});`;

export function loginPage(error: string | null, notice: string | null = null): string {
  return page(
    'دخول لوحة الحسابات',
    `<h1>لوحة الحسابات</h1>
${notice === null ? '' : `<div class="card notice"><strong>${escapeHtml(notice)}</strong></div>`}
<div class="card"><form method="post" action="/admin/login">
<label>كلمة السر<input type="password" name="password" autocomplete="current-password" required autofocus></label>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<button type="submit">دخول</button></form></div>`,
  );
}

export function messagePage(title: string, text: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><div class="card"><p>${escapeHtml(text)}</p><p><a href="/admin">رجوع للوحة</a></p></div>`);
}

export type AccountAction = 'approve' | 'disable' | 'enable' | 'password' | 'plan';

const ACTION_LABELS: Record<AccountAction, string> = {
  approve: 'موافقة',
  enable: 'تشغيل تاني',
  disable: 'إيقاف',
  password: 'كلمة سر جديدة',
  plan: 'الخطة',
};

function actionForm(action: AccountAction, id: string): string {
  const cls = action === 'disable' ? 'danger' : action === 'password' || action === 'plan' ? 'quiet' : '';
  const method = action === 'plan' ? 'get' : 'post';
  return `<form method="${method}" action="/admin/accounts/${action}">
<input type="hidden" name="id" value="${escapeHtml(id)}">
<button type="submit"${cls === '' ? '' : ` class="${cls}"`}>${escapeHtml(ACTION_LABELS[action])}</button></form>`;
}

/** A trainer who joined a gym and has no approval of their own: the gym approves them, not the owner. */
export function handledByGym(r: AccountRecord, info: RowInfo): boolean {
  return r.status === 'pending' && info.membership !== null && info.membership.status !== 'removed';
}

function statusPill(r: AccountRecord, info: RowInfo): string {
  if (handledByGym(r, info)) {
    const active = info.membership?.status === 'active';
    return `<span class="pill ${active ? 'ok' : 'wait'}">${active ? 'شغّال (عن طريق الجيم)' : 'مستني موافقة الجيم'}</span>`;
  }
  return `<span class="pill ${statusTone(r.status)}">${escapeHtml(statusLabel(r.status))}</span>`;
}

export function actionsFor(status: AccountStatus, viaGym = false): AccountAction[] {
  if (viaGym) return ['disable', 'plan', 'password'];
  switch (status) {
    case 'pending':
      return ['approve', 'disable', 'plan', 'password'];
    case 'approved':
      return ['disable', 'plan', 'password'];
    case 'disabled':
      return ['enable', 'plan', 'password'];
  }
}

/** Extra facts for one dashboard row: plan, gym membership, trainers in the gym. */
export interface RowInfo {
  plan: Plan | null;
  membership: Membership | null;
  /** Active trainers, for gym accounts. */
  trainers: number;
}

const MEMBERSHIP_LABEL: Record<Membership['status'], string> = { pending: 'مستني موافقة الجيم', active: 'متوافق عليه من الجيم', removed: 'اتشال من الجيم' };

/** The last Cairo day of a plan (expiresAt is the moment the next day starts). */
export function lastDay(expiresAt: number): string {
  return formatDate(expiresAt - 1).slice(0, 10);
}

function limitText(value: number | null): string {
  return value === null ? 'من غير حد' : `<span class="ltr">${value}</span>`;
}

export function planSummary(info: RowInfo): string {
  const plan = info.plan;
  const parts: string[] = [];
  if (plan?.kind === 'gym') parts.push(`<strong>جيم</strong> — مدربين: <span class="ltr">${info.trainers}</span> من ${limitText(plan.maxTrainers)}`);
  else parts.push('مدرب');
  if (info.membership !== null) parts.push(`تبع <strong>${escapeHtml(info.membership.gymName)}</strong> (${MEMBERSHIP_LABEL[info.membership.status]})`);
  if (plan !== null) {
    parts.push(`عملاء لكل مدرب: ${limitText(plan.maxClients)}`);
    parts.push(`لحد: ${plan.expiresAt === null ? 'مفتوح' : `<span class="ltr">${lastDay(plan.expiresAt)}</span>`}`);
  }
  return parts.join('<br>');
}

function row(r: AccountRecord, info: RowInfo): string {
  const cell = (label: string, value: string, cls = '') =>
    `<td data-label="${label}"${cls === '' ? '' : ` class="${cls}"`}>${value}</td>`;
  return `<tr>${cell('الاسم', escapeHtml(r.name === '' ? '—' : r.name), 'name')}
${cell('الإيميل', `<span class="ltr">${escapeHtml(r.email)}</span>`)}
${cell('الحالة', statusPill(r, info))}
${cell('النوع والخطة', `<span class="muted">${planSummary(info)}</span>`)}
${cell('اتسجل', `<span class="ltr">${formatDate(r.createdAt)}</span>`)}
<td class="acts">${actionsFor(r.status, handledByGym(r, info))
    .map((a) => actionForm(a, r.id))
    .join('')}</td></tr>`;
}

export interface DashboardView {
  records: readonly AccountRecord[];
  info: ReadonlyMap<string, RowInfo>;
  total: number;
  /** Count before filtering. */
  all: number;
  pending: number;
  page: number;
  pages: number;
  q: string;
  status: string;
  notice: string | null;
  /** The list hit the server's read cap: the oldest accounts are not shown. */
  capped: boolean;
}

function pageLink(view: DashboardView, n: number): string {
  const params = new URLSearchParams();
  if (view.q !== '') params.set('q', view.q);
  if (view.status !== '') params.set('status', view.status);
  if (n > 1) params.set('page', String(n));
  const query = params.toString();
  return escapeHtml(`/admin${query === '' ? '' : `?${query}`}`);
}

function pager(view: DashboardView): string {
  if (view.pages <= 1) return '';
  const prev = view.page > 1 ? `<a href="${pageLink(view, view.page - 1)}">السابق</a>` : '<span class="muted">السابق</span>';
  const next = view.page < view.pages ? `<a href="${pageLink(view, view.page + 1)}">التالي</a>` : '<span class="muted">التالي</span>';
  return `<nav class="pager" aria-label="الصفحات">${prev}<span>صفحة <span class="ltr">${view.page} / ${view.pages}</span></span>${next}</nav>`;
}

export function dashboardPage(view: DashboardView): string {
  const rows = view.records.map((r) => row(r, view.info.get(r.id) ?? { plan: null, membership: null, trainers: 0 })).join('');
  const statusOptions = STATUS_FILTERS.map(
    (o) => `<option value="${o.value}"${o.value === view.status ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
  ).join('');
  const filtered = view.q !== '' || view.status !== '';
  const empty = filtered ? 'مفيش نتايج للبحث ده.' : 'لسه مفيش حد عمل حساب. ابعت لينك التطبيق للمدرب، ولما يسجل هيظهر هنا.';
  const waiting =
    view.pending === 0
      ? ''
      : `<div class="card notice"><strong>فيه <span class="ltr">${view.pending}</span> حساب مستني موافقتك.</strong> <a href="/admin?status=pending">اعرضهم</a></div>`;
  return page(
    'لوحة الحسابات',
    `<div class="top"><h1>لوحة الحسابات</h1><form method="post" action="/admin/logout"><button class="link" type="submit">خروج</button></form></div>
${view.notice === null ? '' : `<div class="card notice"><strong>${escapeHtml(view.notice)}</strong></div>`}
${waiting}
<div class="card"><h2>المدربين (${filtered ? `<span class="ltr">${view.total}</span> من <span class="ltr">${view.all}</span>` : `<span class="ltr">${view.all}</span>`})</h2>
<p class="muted">المدرب أو الجيم بيعمل حسابه من التطبيق (إيميل وكلمة سر، أو جوجل). الحساب الجديد بيفضل مستني لحد ما تدوس «موافقة».
عشان تخلي الحساب <strong>جيم</strong>: «الخطة» ← النوع «جيم». مدربين الجيم بيدخلوا بلينك دعوة من الجيم، والجيم هو اللي بيوافق عليهم.</p>
<form class="filters" method="get" action="/admin" role="search">
<label>بحث بالاسم أو الإيميل<input type="search" name="q" value="${escapeHtml(view.q)}" autocomplete="off"></label>
<label>الحالة<select name="status">${statusOptions}</select></label>
<button type="submit" class="quiet">بحث</button>${filtered ? '<a href="/admin">مسح</a>' : ''}</form>
<table>
<thead><tr><th>الاسم</th><th>الإيميل</th><th>الحالة</th><th>النوع والخطة</th><th>اتسجل</th><th></th></tr></thead>
<tbody>${rows === '' ? `<tr><td colspan="6" class="muted">${empty}</td></tr>` : rows}</tbody></table>
${pager(view)}
${view.capped ? '<p class="muted">القائمة بتعرض أحدث الحسابات بس. استخدم البحث عشان توصل للأقدم.</p>' : ''}
</div>`,
  );
}

/** Second step before disable / new password, so one mis-tap on the phone does not lock a trainer out. */
export function confirmPage(action: 'disable' | 'password', record: AccountRecord, suggestedPassword: string): string {
  const who = `<strong>${escapeHtml(record.name === '' ? record.email : record.name)}</strong> (<span class="ltr">${escapeHtml(record.email)}</span>)`;
  const body =
    action === 'disable'
      ? `<p>متأكد إنك عايز توقف حساب ${who}؟ التطبيق عنده هيقفل أول ما يلاقي نت، والنسخة الاحتياطية والتذكيرات هتقف.</p>`
      : `<p>كلمة سر جديدة لـ ${who}. كل الأجهزة اللي داخلة بالحساب هتخرج، والمدرب يدخل بالكلمة الجديدة.</p>
<label>كلمة السر الجديدة (8 حروف على الأقل)<input name="password" class="ltr mono" minlength="8" maxlength="128" value="${escapeHtml(suggestedPassword)}" required autocomplete="off"></label>`;
  return page(
    'تأكيد',
    `<h1>تأكيد</h1><div class="card">
<form method="post" action="/admin/accounts/${action}">
<input type="hidden" name="id" value="${escapeHtml(record.id)}"><input type="hidden" name="confirmed" value="yes">
${body}
<button type="submit" class="${action === 'disable' ? 'danger' : ''}">${action === 'disable' ? 'أيوه، وقّف' : 'غيّر كلمة السر'}</button></form>
<p><a href="/admin">لأ، رجوع</a></p></div>`,
  );
}

/** Shown once after a new password is set, with a ready WhatsApp text. The password is not stored in plain text. */
export function passwordSetPage(input: { record: AccountRecord; password: string; appUrl: string | null }): string {
  const lines = [
    `أهلاً ${input.record.name}،`,
    'كلمة السر الجديدة لحسابك في التطبيق:',
    input.password,
    `الإيميل: ${input.record.email}`,
    ...(input.appUrl === null ? [] : ['لينك التطبيق:', input.appUrl]),
    'ادخل بيها، وتقدر تغيّرها بعد كده.',
  ];
  const message = lines.join('\n');
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return page(
    'كلمة السر الجديدة',
    `<h1>كلمة السر الجديدة</h1>
<div class="card"><p>الحساب: <strong>${escapeHtml(input.record.name)}</strong> (<span class="ltr">${escapeHtml(input.record.email)}</span>)</p>
<p><span id="pw" class="code">${escapeHtml(input.password)}</span></p>
<div class="actions"><button type="button" data-copy="pw">نسخ</button><span class="copied" id="pw-copied" role="status"></span></div>
<p class="error">كلمة السر دي بتظهر هنا مرة واحدة بس. ابعتها دلوقتي.</p></div>
<div class="card"><h2>رسالة جاهزة للمدرب</h2>
<textarea id="msg" readonly dir="rtl">${escapeHtml(message)}</textarea>
<div class="actions"><a class="btn wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener">ابعت على واتساب</a>
<button type="button" class="quiet" data-copy="msg">نسخ الرسالة</button><span class="copied" id="msg-copied" role="status"></span></div></div>
<p><a href="/admin">رجوع للوحة</a></p>`,
  );
}


/** Owner's plan form for one account: type (trainer / gym), limits and end date. */
export function planPage(record: AccountRecord, plan: Plan | null, gymName: string, error: string | null = null): string {
  const kind = plan?.kind ?? 'trainer';
  const value = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  const until = plan?.expiresAt === null || plan?.expiresAt === undefined ? '' : lastDay(plan.expiresAt);
  return page(
    'الخطة',
    `<h1>الخطة</h1><div class="card">
<p><strong>${escapeHtml(record.name === '' ? record.email : record.name)}</strong> (<span class="ltr">${escapeHtml(record.email)}</span>)</p>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<form method="post" action="/admin/accounts/plan">
<input type="hidden" name="id" value="${escapeHtml(record.id)}">
<label>النوع<select name="kind">
<option value="trainer"${kind === 'trainer' ? ' selected' : ''}>مدرب</option>
<option value="gym"${kind === 'gym' ? ' selected' : ''}>جيم (بيدير مدربين)</option></select></label>
<label>اسم الجيم (للجيم بس)<input name="gymName" maxlength="100" value="${escapeHtml(gymName)}" autocomplete="off"></label>
<label>أقصى عدد عملاء لكل مدرب (فاضي = من غير حد)<input name="maxClients" type="number" inputmode="numeric" min="0" max="100000" value="${value(plan?.maxClients)}"></label>
<label>أقصى عدد مدربين في الجيم (للجيم بس، فاضي = من غير حد)<input name="maxTrainers" type="number" inputmode="numeric" min="0" max="10000" value="${value(plan?.maxTrainers)}"></label>
<label>آخر يوم في الاشتراك (فاضي = مفتوح)<input name="until" type="date" value="${until}"></label>
<p class="muted">بعد آخر يوم التطبيق بيقفل عند المدرب (ومدربين الجيم كمان)، والنسخة السحابية بتقف. بياناتهم بتفضل على تليفوناتهم.</p>
<button type="submit">احفظ</button></form>
<p><a href="/admin">رجوع للوحة</a></p></div>`,
  );
}
