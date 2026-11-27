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
:root{color-scheme:light dark;--bg:#F3F1ED;--card:#fff;--ink:#1C1A17;--muted:#6B655C;--line:#E4DED5;--brand:#F25C1F;--brand-ink:#AE4216;--brand-tint:#FDE9DF;--ok:#1E7A45;--ok-tint:#E3F3E8;--wait:#9A6200;--wait-tint:#FBF0D9;--off:#6B655C;--off-tint:#EEEBE6;--danger:#C8321E;--danger-tint:#FBE4E0;--wa:#128C4A;--shadow:0 1px 2px rgba(40,30,20,.06),0 6px 20px rgba(40,30,20,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--card:#1E1C1A;--ink:#F3F1ED;--muted:#A39C92;--line:#2F2C28;--brand:#FF6A2B;--brand-ink:#FF9A6B;--brand-tint:#3A2217;--ok:#5FCF86;--ok-tint:#183326;--wait:#E3B04B;--wait-tint:#3A2E14;--off:#A39C92;--off-tint:#2A2825;--danger:#FF7B6B;--danger-tint:#3D1C18;--wa:#3CCF7D;--shadow:none}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:1120px;margin:0 auto;padding:16px 16px 48px}
a{color:var(--brand-ink);font-weight:600;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:1.6rem;line-height:1.2;margin:0}h2{font-size:1.15rem;margin:0 0 8px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-block:8px 20px}
.brand{display:flex;align-items:center;gap:12px}.brand small{display:block;color:var(--muted);font-weight:500;font-size:.85rem}
.mark{flex:none;inline-size:44px;block-size:44px;border-radius:14px;background:var(--brand);color:#fff;display:grid;place-items:center}.mark i{inline-size:26px;block-size:26px;background:currentColor;-webkit-mask:url(data:image/png;base64,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) center/contain no-repeat;mask:url(data:image/png;base64,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) center/contain no-repeat}
.card{background:var(--card);border-radius:20px;padding:18px;box-shadow:var(--shadow);border:1px solid var(--line)}
.stack>*+*{margin-block-start:16px}
label{display:block;font-weight:600;font-size:.92rem}label>input,label>select{margin-block-start:6px}
input,select,textarea{display:block;inline-size:100%;font:inherit;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink);min-block-size:46px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--brand);outline-offset:1px}
textarea{min-block-size:180px;resize:vertical}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:700;font-size:.95rem;min-block-size:44px;padding:8px 18px;border-radius:999px;border:0;background:var(--brand);color:#fff;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{text-decoration:none;filter:brightness(1.05)}.btn:disabled{opacity:.55;cursor:default}
.btn.soft{background:var(--brand-tint);color:var(--brand-ink)}
.btn.line{background:var(--card);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.btn.warn{background:var(--card);color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger-tint)}
.btn.danger{background:var(--danger);color:#fff}
.btn.wa{background:var(--wa)}.btn.sm{min-block-size:38px;padding:6px 14px;font-size:.88rem}
.notice{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:var(--ok-tint);color:var(--ok);font-weight:700;margin-block-end:16px}
.notice.wait{background:var(--wait-tint);color:var(--wait)}
.error{color:var(--danger);font-weight:700}.muted{color:var(--muted)}.small{font-size:.88rem}
.ltr{direction:ltr;unicode-bidi:isolate}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.tabs{display:flex;gap:8px;overflow-x:auto;padding-block-end:4px;margin-block-end:12px;scrollbar-width:none}
.tab{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--card);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line);font-weight:700;white-space:nowrap}
.tab b{min-inline-size:24px;padding:0 7px;border-radius:999px;background:var(--off-tint);font-size:.82rem;text-align:center}
.tab[aria-current=page]{background:var(--ink);color:var(--bg);box-shadow:none}.tab[aria-current=page] b{background:var(--brand);color:#fff}
.tab.hot b{background:var(--brand);color:#fff}
.search{display:flex;gap:8px;margin-block-end:18px}.search input{flex:1}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.acct{display:flex;flex-direction:column;gap:12px}
.acct.gone{opacity:.45;pointer-events:none}
.who{display:flex;align-items:center;gap:12px;min-inline-size:0}
.avatar{flex:none;inline-size:44px;block-size:44px;border-radius:999px;display:grid;place-items:center;background:var(--brand-tint);color:var(--brand-ink);font-weight:800;font-size:1.15rem}
.who .text{min-inline-size:0;flex:1}.who strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.05rem}
.who .mail{display:block;color:var(--muted);font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:700;white-space:nowrap}
.pill.ok{background:var(--ok-tint);color:var(--ok)}.pill.wait{background:var(--wait-tint);color:var(--wait)}.pill.off{background:var(--off-tint);color:var(--off)}
.meta{font-size:.88rem;color:var(--muted);line-height:1.6}
.acts{display:flex;flex-wrap:wrap;gap:8px;border-block-start:1px solid var(--line);padding-block-start:12px}
.acts form{margin:0}.acts .push{margin-inline-start:auto}
.empty{text-align:center;padding:40px 16px;color:var(--muted)}
.pager{display:flex;gap:12px;align-items:center;justify-content:center;margin-block-start:20px}
.narrow{max-width:560px;margin-inline:auto}
fieldset{border:0;margin:0;padding:0;min-inline-size:0}legend{font-weight:600;font-size:.92rem;margin-block-end:6px;padding:0}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.seg legend{grid-column:1/-1}
.seg label{position:relative;cursor:pointer}.seg input{position:absolute;opacity:0;inset:0;margin:0;min-block-size:0}
.seg span{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:16px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line);font-weight:500}
.seg b{font-size:1rem}.seg small{color:var(--muted);font-size:.82rem}
.seg input:checked+span{background:var(--brand-tint);box-shadow:inset 0 0 0 2px var(--brand)}.seg input:checked+span b{color:var(--brand-ink)}
.seg input:focus-visible+span{outline:2px solid var(--brand);outline-offset:2px}
form:has(input[name=kind][value=trainer]:checked) .gym-only{display:none}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}form:has(input[name=kind][value=trainer]:checked) .pair{grid-template-columns:1fr}
label small{display:block;font-weight:500;margin-block-start:4px}
dialog{border:0;padding:0;background:transparent;inline-size:min(560px,calc(100vw - 32px));max-block-size:calc(100dvh - 32px);color:var(--ink)}
dialog::backdrop{background:rgba(20,15,10,.45);backdrop-filter:blur(3px)}
dialog .card{position:relative;max-block-size:calc(100dvh - 32px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}
dialog[open]{animation:pop .16s ease-out}@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}}
.x{position:absolute;inset-block-start:12px;inset-inline-end:12px;inline-size:36px;block-size:36px;border-radius:999px;border:0;background:var(--off-tint);color:var(--ink);font:700 1.1rem/1 system-ui;cursor:pointer}
dialog .stack>.stack{margin:0}dialog [data-frag].stack>.card+.card{margin-block-start:12px}
@media (max-width:560px){.pair{grid-template-columns:1fr}}
.code{font:700 2rem/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;direction:ltr;unicode-bidi:isolate;user-select:all;padding:12px 16px;border:2px dashed var(--brand);border-radius:16px;display:inline-block}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.copied{color:var(--ok);font-weight:700;min-inline-size:4em}
ul.list{margin:8px 0;padding-inline-start:1.3em}ul.list li+li{margin-block-start:4px}
.danger-box{border-color:var(--danger-tint)}
@media (max-width:560px){h1{font-size:1.35rem}.grid{grid-template-columns:1fr}.code{font-size:1.6rem}}
`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#F25C1F"><title>${escapeHtml(title)}</title><style>${STYLE}</style>
<script src="/admin/admin.js?v=3" defer></script></head>
<body><main>${body}</main></body></html>`;
}

function brandBar(right = ''): string {
  return `<header class="bar"><div class="brand"><span class="mark" aria-hidden="true"><i></i></span><div><h1>لوحة الحسابات</h1><small>Coachly · المالك</small></div></div>${right}</header>`;
}

export { ADMIN_SCRIPT } from './script';

export function loginPage(error: string | null, notice: string | null = null): string {
  return page(
    'دخول لوحة الحسابات',
    `<div class="narrow">${brandBar()}
${notice === null ? '' : `<div class="notice wait">${escapeHtml(notice)}</div>`}
<div class="card"><form method="post" action="/admin/login" class="stack">
<label>كلمة سر المالك<input type="password" name="password" autocomplete="current-password" required autofocus></label>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<button class="btn" type="submit">دخول</button></form></div></div>`,
  );
}

export function messagePage(title: string, text: string): string {
  return page(title, `<div class="narrow">${brandBar()}<div class="card stack" data-frag><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><a class="btn line" href="/admin">رجوع للوحة</a></div></div>`);
}

export type AccountAction = 'approve' | 'disable' | 'enable' | 'password' | 'plan' | 'delete';

const ACTION_LABELS: Record<AccountAction, string> = {
  approve: 'موافقة',
  enable: 'تشغيل تاني',
  disable: 'إيقاف',
  password: 'كلمة سر جديدة',
  plan: 'الخطة',
  delete: 'مسح نهائي',
};

function actionForm(action: AccountAction, id: string): string {
  const cls = action === 'approve' || action === 'enable' ? 'btn sm' : action === 'disable' ? 'btn sm warn' : action === 'delete' ? 'btn sm warn' : 'btn sm line';
  const method = action === 'plan' ? 'get' : 'post';
  const inline = action === 'approve' || action === 'enable' ? ' data-inline' : ' data-dialog';
  const push = action === 'delete' ? ' class="push"' : '';
  return `<form method="${method}" action="/admin/accounts/${action}"${inline}${push}>
<input type="hidden" name="id" value="${escapeHtml(id)}">
<button type="submit" class="${cls}">${escapeHtml(ACTION_LABELS[action])}</button></form>`;
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
  if (viaGym) return ['plan', 'password', 'disable', 'delete'];
  switch (status) {
    case 'pending':
      return ['approve', 'plan', 'password', 'disable', 'delete'];
    case 'approved':
      return ['plan', 'password', 'disable', 'delete'];
    case 'disabled':
      return ['enable', 'plan', 'password', 'delete'];
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

/** One account as a card (also returned alone for quick actions, see ADMIN_SCRIPT). */
export function accountCard(r: AccountRecord, info: RowInfo): string {
  const display = r.name === '' ? r.email : r.name;
  return `<article class="card acct" id="acct-${escapeHtml(r.id)}">
<div class="who"><span class="avatar" aria-hidden="true">${escapeHtml(display.trim().charAt(0).toUpperCase() || '?')}</span>
<div class="text"><strong>${escapeHtml(r.name === '' ? '—' : r.name)}</strong><span class="mail ltr">${escapeHtml(r.email)}</span></div>${statusPill(r, info)}</div>
<div class="meta">${planSummary(info)}<br>اتسجل <span class="ltr">${formatDate(r.createdAt)}</span></div>
<div class="acts">${actionsFor(r.status, handledByGym(r, info))
    .map((a) => actionForm(a, r.id))
    .join('')}</div></article>`;
}

export interface DashboardView {
  records: readonly AccountRecord[];
  info: ReadonlyMap<string, RowInfo>;
  /** Matches for the current search / filter. */
  total: number;
  counts: { all: number; approved: number; disabled: number; pending: number; waiting: number };
  page: number;
  pages: number;
  q: string;
  status: string;
  notice: string | null;
}

function link(q: string, status: string, n = 1): string {
  const params = new URLSearchParams();
  if (q !== '') params.set('q', q);
  if (status !== '') params.set('status', status);
  if (n > 1) params.set('page', String(n));
  const query = params.toString();
  return escapeHtml(`/admin${query === '' ? '' : `?${query}`}`);
}

function pager(view: DashboardView): string {
  if (view.pages <= 1) return '';
  const prev = view.page > 1 ? `<a class="btn line sm" href="${link(view.q, view.status, view.page - 1)}">السابق</a>` : '';
  const next = view.page < view.pages ? `<a class="btn line sm" href="${link(view.q, view.status, view.page + 1)}">التالي</a>` : '';
  return `<nav class="pager" aria-label="الصفحات">${prev}<span class="muted">صفحة <span class="ltr">${view.page} / ${view.pages}</span></span>${next}</nav>`;
}

export function dashboardPage(view: DashboardView): string {
  const cards = view.records.map((r) => accountCard(r, view.info.get(r.id) ?? { plan: null, membership: null, trainers: 0 })).join('');
  const count: Record<string, number> = { '': view.counts.all, pending: view.counts.pending, approved: view.counts.approved, disabled: view.counts.disabled };
  const tabs = STATUS_FILTERS.map((o) => {
    const current = o.value === view.status;
    const hot = o.value === 'pending' && view.counts.waiting > 0 && !current;
    const n = o.value === 'pending' ? `<b id="waiting-count">${view.counts.waiting}</b>` : `<b>${count[o.value] ?? 0}</b>`;
    return `<a class="tab${hot ? ' hot' : ''}" href="${link(view.q, o.value)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(o.label)}${n}</a>`;
  }).join('');
  const filtered = view.q !== '' || view.status !== '';
  const empty = filtered
    ? 'مفيش نتايج.'
    : 'لسه مفيش حد عمل حساب. ابعت لينك التطبيق للمدرب، ولما يسجل هيظهر هنا.';
  return page(
    'لوحة الحسابات',
    `${brandBar('<form method="post" action="/admin/logout"><button class="btn line sm" type="submit">خروج</button></form>')}
${view.notice === null ? '' : `<div class="notice" role="status">${escapeHtml(view.notice)}</div>`}
<nav class="tabs" aria-label="الحالة">${tabs}</nav>
<form class="search" method="get" action="/admin" role="search">
${view.status === '' ? '' : `<input type="hidden" name="status" value="${escapeHtml(view.status)}">`}
<input type="search" name="q" value="${escapeHtml(view.q)}" placeholder="دوّر بالاسم أو الإيميل" aria-label="بحث بالاسم أو الإيميل" autocomplete="off">
<button type="submit" class="btn soft">بحث</button>${view.q !== '' ? `<a class="btn line" href="${link('', view.status)}">مسح</a>` : ''}</form>
${cards === '' ? `<div class="card empty">${empty}</div>` : `<p class="muted small">${filtered ? `<span class="ltr">${view.total}</span> نتيجة` : `<span class="ltr">${view.total}</span> حساب`} · الجديد الأول</p><section class="grid">${cards}</section>`}
${pager(view)}
<p class="muted small" style="margin-block-start:24px">المدرب أو الجيم بيعمل حسابه من التطبيق (إيميل وكلمة سر، أو جوجل) وبيفضل مستني لحد ما توافق. عشان تخلي الحساب جيم: «الخطة» ← النوع «جيم». مدربين الجيم بيدخلوا بلينك دعوة، والجيم هو اللي بيوافق عليهم.</p>`,
  );
}

/** What a complete delete removes, shown before the owner confirms by typing the email. */
export function deletePage(record: AccountRecord, info: { gymTrainers: number; isGym: boolean }, error: string | null = null): string {
  const who = `<strong>${escapeHtml(record.name === '' ? record.email : record.name)}</strong> (<span class="ltr">${escapeHtml(record.email)}</span>)`;
  return page(
    'مسح الحساب',
    `<div class="narrow">${brandBar()}<div class="card stack danger-box" data-frag>
<h2>مسح ${who} نهائياً</h2>
<p>ده بيمسح كل حاجة على السيرفر للحساب ده، ومينفعش يرجع:</p>
<ul class="list"><li>الحساب نفسه وكل أجهزته اللي داخلة (هيخرج منها)</li><li>الخطة والاشتراك</li>
<li>النسخ الاحتياطية السحابية، وصفحات العملاء ومتابعاتهم، والصور والملفات المرفوعة</li><li>التذكيرات والإشعارات</li>
${info.isGym ? `<li>الجيم نفسه: <strong class="ltr">${info.gymTrainers}</strong> مدرب هيبقوا مش تبع جيم (حساباتهم بتفضل، ومحتاجة موافقتك لو كانوا شغالين عن طريق الجيم)</li>` : ''}</ul>
<p class="muted small">البيانات اللي على تليفون المدرب نفسه مش بتتمسح. لو عايز توقفه بس من غير مسح، استخدم «إيقاف».</p>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<form method="post" action="/admin/accounts/delete" class="stack">
<input type="hidden" name="id" value="${escapeHtml(record.id)}"><input type="hidden" name="confirmed" value="yes">
<label>اكتب الإيميل عشان تأكد<input name="email" class="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(record.email)}" required></label>
<div class="actions"><button type="submit" class="btn danger">امسح الحساب نهائياً</button><a class="btn line" href="/admin">لأ، رجوع</a></div></form></div></div>`,
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
    `<div class="narrow">${brandBar()}<div class="card" data-frag>
<form method="post" action="/admin/accounts/${action}" class="stack">
<input type="hidden" name="id" value="${escapeHtml(record.id)}"><input type="hidden" name="confirmed" value="yes">
${body}
<div class="actions"><button type="submit" class="btn${action === 'disable' ? ' danger' : ''}">${action === 'disable' ? 'أيوه، وقّف' : 'غيّر كلمة السر'}</button><a class="btn line" href="/admin">لأ، رجوع</a></div></form></div></div>`,
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
    `<div class="narrow stack">${brandBar()}<div class="stack" data-frag>
<div class="card stack"><h2>كلمة السر الجديدة</h2><p>الحساب: <strong>${escapeHtml(input.record.name)}</strong> (<span class="ltr">${escapeHtml(input.record.email)}</span>)</p>
<p><span id="pw" class="code">${escapeHtml(input.password)}</span></p>
<div class="actions"><button type="button" class="btn" data-copy="pw">نسخ</button><span class="copied" id="pw-copied" role="status"></span></div>
<p class="error">كلمة السر دي بتظهر هنا مرة واحدة بس. ابعتها دلوقتي.</p></div>
<div class="card stack"><h2>رسالة جاهزة للمدرب</h2>
<textarea id="msg" readonly dir="rtl">${escapeHtml(message)}</textarea>
<div class="actions"><a class="btn wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener">ابعت على واتساب</a>
<button type="button" class="btn line" data-copy="msg">نسخ الرسالة</button><span class="copied" id="msg-copied" role="status"></span></div></div>
<a class="btn line" href="/admin">رجوع للوحة</a></div></div>`,
  );
}

/** Owner's plan form for one account: type (trainer / gym), limits and end date. */
export function planPage(record: AccountRecord, plan: Plan | null, gymName: string, error: string | null = null): string {
  const kind = plan?.kind ?? 'trainer';
  const value = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  const until = plan?.expiresAt === null || plan?.expiresAt === undefined ? '' : lastDay(plan.expiresAt);
  return page(
    'الخطة',
    `<div class="narrow">${brandBar()}<div class="card stack" data-frag><h2>الخطة</h2>
<p><strong>${escapeHtml(record.name === '' ? record.email : record.name)}</strong> (<span class="ltr">${escapeHtml(record.email)}</span>)</p>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<form method="post" action="/admin/accounts/plan" class="stack">
<input type="hidden" name="id" value="${escapeHtml(record.id)}">
<fieldset class="seg"><legend>النوع</legend>
<label><input type="radio" name="kind" value="trainer"${kind === 'trainer' ? ' checked' : ''}><span><b>مدرب</b><small>بيدير عملاءه بس</small></span></label>
<label><input type="radio" name="kind" value="gym"${kind === 'gym' ? ' checked' : ''}><span><b>جيم</b><small>بيدير مدربين</small></span></label></fieldset>
<label class="gym-only">اسم الجيم<input name="gymName" maxlength="100" value="${escapeHtml(gymName)}" autocomplete="off" placeholder="مثلاً: جيم الأبطال"></label>
<div class="pair">
<label>أقصى عدد عملاء لكل مدرب<input name="maxClients" type="number" inputmode="numeric" min="0" max="100000" value="${value(plan?.maxClients)}" placeholder="من غير حد"></label>
<label class="gym-only">أقصى عدد مدربين<input name="maxTrainers" type="number" inputmode="numeric" min="0" max="10000" value="${value(plan?.maxTrainers)}" placeholder="من غير حد"></label></div>
<label>آخر يوم في الاشتراك<input name="until" type="date" value="${until}"><small class="muted">فاضي = الاشتراك مفتوح</small></label>
<p class="muted">بعد آخر يوم التطبيق بيقفل عند المدرب (ومدربين الجيم كمان)، والنسخة السحابية بتقف. بياناتهم بتفضل على تليفوناتهم.</p>
<div class="actions"><button type="submit" class="btn">احفظ</button><a class="btn line" href="/admin">رجوع</a></div></form></div></div>`,
  );
}
