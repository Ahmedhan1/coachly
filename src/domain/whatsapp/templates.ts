/**
 * WhatsApp message templates: pure rendering and wa.me links.
 *
 * Placeholders are written in Arabic inside braces, e.g. "أهلاً {الاسم}". The default texts live in i18n
 * and are passed in; this module never holds user-visible copy.
 */

import { toWesternDigits } from './phone';

export const PLACEHOLDERS = ['الاسم', 'الموعد', 'الباقة', 'المبلغ'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type TemplateValues = Partial<Record<Placeholder, string>>;

export const BUILTIN_KINDS = ['session_reminder', 'renewal', 'record', 'payment_due', 'missed_session', 'checkin_reminder', 'birthday', 'welcome', 'program_ready', 'shopping_list'] as const;
export type BuiltinKind = (typeof BUILTIN_KINDS)[number];
export type TemplateKind = BuiltinKind | 'custom';

export interface WhatsappTemplate {
  id: string;
  kind: TemplateKind;
  title: string;
  body: string;
}

export interface RenderedTemplate {
  text: string;
  /** Known placeholders used in the body that had no value (they are dropped from the text). */
  missing: Placeholder[];
}

/** English spellings accepted in template bodies (the English default texts use them). */
export const PLACEHOLDER_ALIASES: Readonly<Record<string, Placeholder>> = {
  name: 'الاسم',
  when: 'الموعد',
  package: 'الباقة',
  amount: 'المبلغ',
};

/** Placeholder token as written in a body for the given language, e.g. "{name}" or "{الاسم}". */
export function placeholderToken(p: Placeholder, english: boolean): string {
  const alias = english ? Object.keys(PLACEHOLDER_ALIASES).find((k) => PLACEHOLDER_ALIASES[k] === p) : undefined;
  return `{${alias ?? p}}`;
}

const PLACEHOLDER_RE = /\{([^{}\n]{1,20})\}/g;

function canonical(name: string): string {
  return PLACEHOLDER_ALIASES[name] ?? name;
}

function isPlaceholder(name: string): name is Placeholder {
  return (PLACEHOLDERS as readonly string[]).includes(name);
}

/** Placeholders a body uses, in order of first appearance, without duplicates. */
export function placeholdersIn(body: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    const name = canonical((m[1] ?? '').trim());
    if (isPlaceholder(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Fills the placeholders. A missing (or blank) value removes the placeholder and tidies the spaces and
 * punctuation around it, so "أهلاً {الاسم}، " never shows braces to the client. Unknown {words} are kept.
 */
export function renderTemplate(body: string, values: TemplateValues): RenderedTemplate {
  const missing: Placeholder[] = [];
  const replaced = body.replace(PLACEHOLDER_RE, (match, raw: string) => {
    const name = canonical(raw.trim());
    if (!isPlaceholder(name)) return match;
    const value = values[name]?.trim();
    if (value) return value;
    if (!missing.includes(name)) missing.push(name);
    return '';
  });
  const text = replaced
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +([،,.!؟?:])/g, '$1')
        .replace(/^([،,:]) */, '')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, missing };
}

/**
 * Phone number in the digits-only international form wa.me expects.
 * Egyptian mobiles typed locally (01xxxxxxxxx, 11 digits) become 201xxxxxxxxx; "+20…" / "0020…" keep their
 * country code; other numbers starting with 0 get `defaultCountryCode`. Null when it cannot be a phone.
 */
export function normalizePhoneForWhatsapp(phone: string, defaultCountryCode = '20'): string | null {
  const trimmed = toWesternDigits(phone).trim();
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (/^01[0125]\d{8}$/.test(digits)) {
    digits = `20${digits.slice(1)}`;
  } else if (/^1[0125]\d{8}$/.test(digits) && defaultCountryCode === '20') {
    // "1001234567": Egyptian mobile typed without the leading 0
    digits = `20${digits}`;
  } else if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  }
  // Egyptian numbers typed as "+2001…" keep a stray 0 after the country code.
  if (/^2001[0125]\d{8}$/.test(digits)) digits = `20${digits.slice(3)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** `https://wa.me/<phone>?text=<message>`; without a usable phone, a share link the trainer addresses. */
export function whatsappLink(phone: string, text: string): string {
  const number = normalizePhoneForWhatsapp(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return number ? `https://wa.me/${number}${query}` : `https://wa.me/${query}`;
}

/**
 * Stored templates merged over the defaults: every built-in kind is always present (a stored edit wins),
 * then custom templates in stored order.
 */
export function mergeTemplates(defaults: readonly WhatsappTemplate[], stored: readonly WhatsappTemplate[]): WhatsappTemplate[] {
  const builtins = defaults.map((d) => stored.find((s) => s.kind === d.kind && s.kind !== 'custom') ?? d);
  const custom = stored.filter((s) => s.kind === 'custom');
  return [...builtins, ...custom];
}

/** The template for a built-in purpose (falls back to the default). */
export function templateFor(kind: BuiltinKind, templates: readonly WhatsappTemplate[]): WhatsappTemplate | undefined {
  return templates.find((x) => x.kind === kind);
}
