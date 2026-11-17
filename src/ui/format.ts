import { getLocale, t, type TKey } from '@/i18n';

/** Formatting locale for the active language, always with Western digits (0-9), per product rule. */
export const LOCALE = getLocale() === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn';

/** Separator for joining short lists in running text ("، " in Arabic, ", " in English). */
export const LIST_SEP = getLocale() === 'en' ? ', ' : '، ';

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

export const formatTime = (epochMs: number) => timeFmt.format(epochMs);
export const formatLongDate = (date: Date) => longDateFmt.format(date);
export const formatNumber = (n: number) => numberFmt.format(n);

/** "5:00" and "م"/"pm" separately, so the big hero time can style the period smaller and outside the LTR isolate. */
export function timeParts(epochMs: number): { clock: string; period: string } {
  const parts = timeFmt.formatToParts(epochMs);
  const clock = parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim()
    .replace(/\s+/g, '');
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  return { clock: clock.replace(/[^\d:]/g, ''), period };
}

/** `YYYY-MM-DD` shown as e.g. "16 نوفمبر" (parsed as a local calendar date). */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Integer minor units → "1,500" (digits only; the currency label is rendered outside the LTR isolate). */
export function formatAmount(minor: number): string {
  return moneyFmt.format(minor / 100);
}

export function currencyLabel(currency: string): string {
  const key = `currency.${currency}` as TKey;
  const label = t(key);
  return label === key ? currency : label;
}

/** Plain-text money for aria labels and toasts: "1,500 ج.م". */
export function formatMoney(minor: number, currency: string): string {
  return `${formatAmount(minor)} ${currencyLabel(currency)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return t('units.gb', { n: formatNumber(bytes / 1e9) });
  return t('units.mb', { n: formatNumber(bytes / 1e6) });
}
