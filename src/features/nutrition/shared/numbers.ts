import { formatNumber } from '@/ui/format';

/** Parses what the trainer typed: accepts Arabic-Indic digits, "," or "٫" decimals. NaN when empty/invalid. */
export function parseDecimal(text: string): number {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.');
  if (normalized === '' || !/^-?\d*\.?\d+$|^-?\d+\.?$/.test(normalized)) return Number.NaN;
  return Number.parseFloat(normalized);
}

/** Number → field text (Western digits, no grouping). */
export const fieldText = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(Math.round(n * 100) / 100));

export const kcalText = (n: number) => formatNumber(Math.round(n));
export const gramsText = (n: number) => formatNumber(Math.round(n));
export const oneDecimal = (n: number) => formatNumber(Math.round(n * 10) / 10);
