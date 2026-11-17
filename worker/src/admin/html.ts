import { formatShortCode } from '../../../shared/license';
import type { LicenseRecord } from '../ports';

export const DURATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'lifetime', label: 'مدى الحياة' },
  { value: '30', label: 'شهر' },
  { value: '90', label: '3 شهور' },
  { value: '180', label: '6 شهور' },
  { value: '365', label: 'سنة' },
  { value: '730', label: 'سنتين' },
];

export const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'الكل' },
  { value: 'waiting', label: 'لسه ما اتفعلش' },
  { value: 'active', label: 'شغّال' },
  { value: 'ended', label: 'ملغي أو منتهي أو متنقل' },
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

export function durationLabel(days: number | null): string {
  if (days === null) return 'مدى الحياة';
  return DURATION_OPTIONS.find((o) => o.value === String(days))?.label ?? `${days} يوم`;
}

export function statusLabel(r: LicenseRecord, now: number): string {
  switch (r.status) {
    case 'issued':
      return now > r.actBy ? 'مهلة التفعيل خلصت' : 'لسه ما اتفعلش';
    case 'active':
      return r.expiresAt !== null && now >= r.expiresAt ? 'انتهت مدته' : 'شغّال';
    case 'revoked':
      return 'ملغي';
    case 'replaced':
      return 'اتنقل لجهاز جديد';
  }
}

/** Which filter bucket a record falls in (matches STATUS_FILTERS values). */
export function statusBucket(r: LicenseRecord, now: number): 'waiting' | 'active' | 'ended' {
  if (r.status === 'issued') return now > r.actBy ? 'ended' : 'waiting';
  if (r.status === 'active') return r.expiresAt !== null && now >= r.expiresAt ? 'ended' : 'active';
  return 'ended';
}

function statusTone(r: LicenseRecord, now: number): string {
  const bucket = statusBucket(r, now);
  return bucket === 'active' ? 'ok' : bucket === 'waiting' ? 'wait' : 'off';
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
td form{display:inline-block;margin-inline-end:8px;margin-block-end:4px}
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
    'دخول لوحة الأكواد',
    `<h1>لوحة الأكواد</h1>
${notice === null ? '' : `<div class="card notice"><strong>${escapeHtml(notice)}</strong></div>`}
<div class="card"><form method="post" action="/admin/login">
<label>كلمة السر<input type="password" name="password" autocomplete="current-password" required autofocus></label>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<button type="submit">دخول</button></form></div>`,
  );
}

function actionForm(action: 'move' | 'revoke', lid: string, label: string, danger: boolean): string {
  return `<form method="post" action="/admin/licenses/${action}">
<input type="hidden" name="lid" value="${escapeHtml(lid)}">
<button type="submit" class="${danger ? 'danger' : 'quiet'}">${escapeHtml(label)}</button></form>`;
}

/** Short, stable label for the device a license is bound to (first 8 hex of the device fingerprint). */
export function deviceLabel(fp: string | null): string {
  return fp === null ? '—' : fp.slice(0, 8);
}

function row(r: LicenseRecord, now: number): string {
  const open = r.status === 'issued' || r.status === 'active';
  const actions = open
    ? actionForm('move', r.lid, 'نقل لجهاز جديد', false) + actionForm('revoke', r.lid, 'إلغاء', true)
    : '<span class="muted">—</span>';
  const cell = (label: string, value: string, cls = '') =>
    `<td data-label="${label}"${cls === '' ? '' : ` class="${cls}"`}>${value}</td>`;
  return `<tr>${cell('الاسم', escapeHtml(r.customerName), 'name')}
${cell('الحالة', `<span class="pill ${statusTone(r, now)}">${escapeHtml(statusLabel(r, now))}</span>`)}
${cell('المدة', escapeHtml(durationLabel(r.durationDays)))}
${cell('اتعمل', `<span class="ltr">${formatDate(r.createdAt)}</span>`)}
${cell('آخر موعد للتفعيل', r.status === 'issued' ? `<span class="ltr">${formatDate(r.actBy)}</span>` : '—')}
${cell('اتفعّل', `<span class="ltr">${formatDate(r.activatedAt)}</span>`)}
${cell('الجهاز', `<span class="ltr mono">${escapeHtml(deviceLabel(r.deviceFp))}</span>`)}
${cell('ينتهي', `<span class="ltr">${formatDate(r.expiresAt)}</span>`)}
<td class="acts">${actions}</td></tr>`;
}

export function generateForm(): string {
  const options = DURATION_OPTIONS.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
  return `<div class="card"><h2>كود جديد</h2><form method="post" action="/admin/codes">
<label>اسم العميل<input name="name" maxlength="100" required autocomplete="off"></label>
<label>مدة الترخيص<select name="duration">${options}</select></label>
<label>مهلة التفعيل (بالأيام)<input name="window" type="number" inputmode="numeric" min="1" max="365" value="14" required></label>
<button type="submit">طلّع الكود</button></form></div>`;
}

export interface DashboardView {
  records: readonly LicenseRecord[];
  total: number;
  /** Count before filtering. */
  all: number;
  page: number;
  pages: number;
  q: string;
  status: string;
  notice: string | null;
  /** The list hit the server's read cap: the oldest licenses are not shown. */
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

export function dashboardPage(view: DashboardView, now: number): string {
  const rows = view.records.map((r) => row(r, now)).join('');
  const statusOptions = STATUS_FILTERS.map(
    (o) => `<option value="${o.value}"${o.value === view.status ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
  ).join('');
  const filtered = view.q !== '' || view.status !== '';
  const empty = filtered ? 'مفيش نتايج للبحث ده.' : 'لسه مفيش أكواد. اكتب اسم العميل فوق واضغط «طلّع الكود».';
  return page(
    'لوحة الأكواد',
    `<div class="top"><h1>لوحة الأكواد</h1><form method="post" action="/admin/logout"><button class="link" type="submit">خروج</button></form></div>
${view.notice === null ? '' : `<div class="card notice"><strong>${escapeHtml(view.notice)}</strong></div>`}
${generateForm()}
<div class="card"><h2>العملاء (<span class="ltr">${filtered ? `${view.total} / ${view.all}` : view.all}</span>)</h2>
<form class="filters" method="get" action="/admin" role="search">
<label>بحث بالاسم<input type="search" name="q" value="${escapeHtml(view.q)}" autocomplete="off"></label>
<label>الحالة<select name="status">${statusOptions}</select></label>
<button type="submit" class="quiet">بحث</button>${filtered ? '<a href="/admin">مسح</a>' : ''}</form>
<table>
<thead><tr><th>الاسم</th><th>الحالة</th><th>المدة</th><th>اتعمل</th><th>آخر موعد للتفعيل</th><th>اتفعّل</th><th>الجهاز</th><th>ينتهي</th><th></th></tr></thead>
<tbody>${rows === '' ? `<tr><td colspan="9" class="muted">${empty}</td></tr>` : rows}</tbody></table>
${pager(view)}
${view.capped ? '<p class="muted">القائمة بتعرض أحدث الأكواد بس. استخدم البحث عشان توصل للأقدم.</p>' : ''}
</div>`,
  );
}

/** Ready-to-send WhatsApp text: app link, code and the 3 install steps for iPhone and Android. */
export function welcomeMessage(input: { name: string; code: string; actBy: number; appUrl: string | null }): string {
  const lines = [
    `أهلاً ${input.name}،`,
    ...(input.appUrl === null ? [] : ['لينك التطبيق:', input.appUrl]),
    'كود التفعيل:',
    formatShortCode(input.code),
    '',
    'التثبيت في 3 خطوات:',
    '1. افتح اللينك: على الآيفون من Safari، وعلى أندرويد من Chrome.',
    '2. ثبّته على الشاشة الرئيسية: الآيفون: زرار المشاركة ثم «إضافة إلى الشاشة الرئيسية». أندرويد: زرار التثبيت أو قايمة ⋮ ثم «تثبيت التطبيق».',
    `3. افتح التطبيق من الأيقونة واكتب الكود (قبل ${formatDate(input.actBy).slice(0, 10)}).`,
  ];
  return lines.join('\n');
}

export function codeIssuedPage(input: {
  code: string;
  name: string;
  actBy: number;
  durationDays: number | null;
  moved: boolean;
  appUrl: string | null;
}): string {
  const message = welcomeMessage(input);
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return page(
    'الكود الجديد',
    `<h1>${input.moved ? 'كود النقل لجهاز جديد' : 'الكود الجديد'}</h1>
<div class="card"><p>العميل: <strong>${escapeHtml(input.name)}</strong> — المدة: ${escapeHtml(durationLabel(input.durationDays))}</p>
<p><span id="code" class="code">${escapeHtml(formatShortCode(input.code))}</span></p>
<div class="actions"><button type="button" data-copy="code">نسخ الكود</button><span class="copied" id="code-copied" role="status"></span></div>
<p>لازم يتفعّل قبل: <strong class="ltr">${formatDate(input.actBy)}</strong> (بتوقيت القاهرة)</p>
<p class="error">الكود ده بيظهر هنا بس لمدة نص ساعة، ومش متخزن عندنا غير بصمته. ابعته دلوقتي.</p>
${input.moved ? '<p class="muted">الجهاز القديم اتلغى. أول ما التطبيق القديم يلاقي نت هيقفل.</p>' : ''}
</div>
<div class="card"><h2>رسالة جاهزة للمدرب</h2>
${input.appUrl === null ? '<p class="error">لينك التطبيق مش متظبط في السيرفر (APP_ORIGIN)، فالرسالة من غير لينك.</p>' : ''}
<textarea id="msg" readonly dir="rtl">${escapeHtml(message)}</textarea>
<div class="actions"><a class="btn wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener">ابعت على واتساب</a>
<button type="button" class="quiet" data-copy="msg">نسخ الرسالة</button><span class="copied" id="msg-copied" role="status"></span></div>
</div>
<p><a href="/admin">رجوع للوحة</a></p>`,
  );
}

export function issuedGonePage(): string {
  return page(
    'الكود مش ظاهر',
    `<h1>الكود مش ظاهر</h1><div class="card"><p>الكود بيظهر نص ساعة بس بعد ما يطلع، وبعدها بيختفي لأننا مش بنخزّنه.</p>
<p>لو ضاع منك: من اللوحة اضغط «نقل لجهاز جديد» على نفس العميل، هيطلع له كود جديد والقديم يتلغى.</p>
<p><a href="/admin">رجوع للوحة</a></p></div>`,
  );
}

export function messagePage(title: string, text: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><div class="card"><p>${escapeHtml(text)}</p><p><a href="/admin">رجوع للوحة</a></p></div>`);
}

/** Second step before revoke / move, so one mis-tap on the phone does not cancel a customer. */
export function confirmPage(action: 'move' | 'revoke', record: LicenseRecord): string {
  const name = escapeHtml(record.customerName);
  const text =
    action === 'revoke'
      ? `متأكد إنك عايز تلغي ترخيص <strong>${name}</strong>؟ التطبيق عنده هيقفل أول ما يلاقي نت.`
      : `هيتلغى الجهاز الحالي لـ <strong>${name}</strong> ويطلع كود جديد بنفس المدة (ولو الترخيص كان شغّال، بنفس تاريخ الانتهاء).`;
  const windowField =
    action === 'move'
      ? '<label>مهلة التفعيل للكود الجديد (بالأيام)<input name="window" type="number" inputmode="numeric" min="1" max="365" value="14" required></label>'
      : '';
  return page(
    'تأكيد',
    `<h1>تأكيد</h1><div class="card"><p>${text}</p>
<form method="post" action="/admin/licenses/${action}">
<input type="hidden" name="lid" value="${escapeHtml(record.lid)}"><input type="hidden" name="confirmed" value="yes">
${windowField}
<button type="submit" class="${action === 'revoke' ? 'danger' : ''}">${action === 'revoke' ? 'أيوه، ألغي' : 'أيوه، انقل'}</button></form>
<p><a href="/admin">لأ، رجوع</a></p></div>`,
  );
}
