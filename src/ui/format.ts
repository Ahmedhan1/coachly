import { t } from '@/i18n';

/** Arabic locale with Western digits (0-9), per product rule. */
export const LOCALE = 'ar-EG-u-nu-latn';

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export const formatTime = (epochMs: number) => timeFmt.format(epochMs);
export const formatLongDate = (date: Date) => longDateFmt.format(date);
export const formatNumber = (n: number) => numberFmt.format(n);

/** `YYYY-MM-DD` shown as e.g. "16 نوفمبر" (parsed as a local calendar date). */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return dateFmt.format(new Date(y, m - 1, d));
}

/** Integer minor units to a display amount: 150000 EGP -> "1,500 ج.م". */
export function formatMoney(minor: number, currency: string): string {
  const major = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(minor / 100);
  const label = currency === 'EGP' ? t('currency.EGP') : currency;
  return `${major} ${label}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return t('units.gb', { n: formatNumber(bytes / 1e9) });
  return t('units.mb', { n: formatNumber(bytes / 1e6) });
}
