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

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#15181d;--card:#fff;--line:#d9dde3;--accent:#0b6bcb;--danger:#b42318;--muted:#5b6470}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#e9edf2;--card:#1a1f25;--line:#2c333b;--accent:#4ea1f3;--danger:#f07167;--muted:#9aa4af}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-block-start:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-block-end:16px}
label{display:block;margin-block-end:12px}input,select{display:block;width:100%;max-width:360px;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
button{font:inherit;padding:8px 16px;border-radius:8px;border:0;background:var(--accent);color:#fff;cursor:pointer}
button.danger{background:var(--danger)}button.link{background:none;color:var(--accent);padding:0}
.code{font:700 2rem/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;direction:ltr;unicode-bidi:isolate;user-select:all;padding:12px;border:2px dashed var(--accent);border-radius:12px;display:inline-block}
.muted{color:var(--muted)}.error{color:var(--danger);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{text-align:start;padding:8px;border-block-end:1px solid var(--line);vertical-align:top}
td form{display:inline-block;margin-inline-end:8px;margin-block-end:4px}.scroll{overflow-x:auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

export function loginPage(error: string | null): string {
  return page(
    'دخول لوحة الأكواد',
    `<h1>لوحة الأكواد</h1>
<div class="card"><form method="post" action="/admin/login">
<label>كلمة السر<input type="password" name="password" autocomplete="current-password" required autofocus></label>
${error === null ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<button type="submit">دخول</button></form></div>`,
  );
}

function actionForm(action: 'move' | 'revoke', lid: string, label: string, danger: boolean): string {
  return `<form method="post" action="/admin/licenses/${action}">
<input type="hidden" name="lid" value="${escapeHtml(lid)}">
<button type="submit" class="${danger ? 'danger' : ''}">${escapeHtml(label)}</button></form>`;
}

function row(r: LicenseRecord, now: number): string {
  const open = r.status === 'issued' || r.status === 'active';
  const actions = open
    ? actionForm('move', r.lid, 'نقل لجهاز جديد', false) + actionForm('revoke', r.lid, 'إلغاء', true)
    : '<span class="muted">—</span>';
  return `<tr><td>${escapeHtml(r.customerName)}</td><td>${escapeHtml(statusLabel(r, now))}</td>
<td>${escapeHtml(durationLabel(r.durationDays))}</td><td>${formatDate(r.createdAt)}</td>
<td>${r.status === 'issued' ? formatDate(r.actBy) : '—'}</td><td>${formatDate(r.activatedAt)}</td>
<td>${formatDate(r.expiresAt)}</td><td>${actions}</td></tr>`;
}

export function generateForm(): string {
  const options = DURATION_OPTIONS.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
  return `<div class="card"><h2>كود جديد</h2><form method="post" action="/admin/codes">
<label>اسم العميل<input name="name" maxlength="100" required></label>
<label>مدة الترخيص<select name="duration">${options}</select></label>
<label>مهلة التفعيل (بالأيام)<input name="window" type="number" min="1" max="365" value="14" required></label>
<button type="submit">طلّع الكود</button></form></div>`;
}

export function dashboardPage(records: readonly LicenseRecord[], now: number, notice: string | null): string {
  const rows = records.map((r) => row(r, now)).join('');
  return page(
    'لوحة الأكواد',
    `<div class="top"><h1>لوحة الأكواد</h1><form method="post" action="/admin/logout"><button class="link" type="submit">خروج</button></form></div>
${notice === null ? '' : `<div class="card"><strong>${escapeHtml(notice)}</strong></div>`}
${generateForm()}
<div class="card"><h2>العملاء (${records.length})</h2><div class="scroll"><table>
<thead><tr><th>الاسم</th><th>الحالة</th><th>المدة</th><th>اتعمل</th><th>آخر موعد للتفعيل</th><th>اتفعّل</th><th>ينتهي</th><th></th></tr></thead>
<tbody>${rows === '' ? '<tr><td colspan="8" class="muted">لسه مفيش أكواد.</td></tr>' : rows}</tbody></table></div></div>`,
  );
}

export function codeIssuedPage(input: { code: string; name: string; actBy: number; durationDays: number | null; moved: boolean }): string {
  return page(
    'الكود الجديد',
    `<h1>${input.moved ? 'كود النقل لجهاز جديد' : 'الكود الجديد'}</h1>
<div class="card"><p>العميل: <strong>${escapeHtml(input.name)}</strong> — المدة: ${escapeHtml(durationLabel(input.durationDays))}</p>
<p><span class="code">${escapeHtml(formatShortCode(input.code))}</span></p>
<p class="error">انسخ الكود دلوقتي وابعته للمدرب. الكود ده بيظهر مرة واحدة بس، ومش متخزن عندنا غير بصمته.</p>
<p>لازم يتفعّل قبل: <strong>${formatDate(input.actBy)}</strong> (بتوقيت القاهرة)</p>
${input.moved ? '<p class="muted">الجهاز القديم اتلغى. أول ما التطبيق القديم يلاقي نت هيقفل.</p>' : ''}
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
      ? '<label>مهلة التفعيل للكود الجديد (بالأيام)<input name="window" type="number" min="1" max="365" value="14" required></label>'
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
