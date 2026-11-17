import type { Client } from '@/domain/models';
import type { TemplateValues } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { formatIsoDate, formatMoney, LOCALE, timeParts } from '@/ui/format';

const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });

/** "الأربعاء 18 نوفمبر 6:00 م" — what {الموعد} becomes. */
export function sessionWhen(startsAt: number): string {
  const d = new Date(startsAt);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { clock, period } = timeParts(startsAt);
  return `${weekdayFmt.format(d)} ${formatIsoDate(iso)} ${clock} ${period}`.trim();
}

/** Placeholder values for a client, optionally with a session time and an amount (minor units). */
export function templateValues(
  client: Pick<Client, 'name' | 'package'>,
  extra: { startsAt?: number | null; amountMinor?: number | null; currency?: string } = {},
): TemplateValues {
  const pkg = client.package;
  const packageLabel = pkg ? pkg.name.trim() || t('schedule.wa.packageSessions', { n: pkg.totalSessions }) : undefined;
  const amountMinor = extra.amountMinor ?? (pkg && pkg.priceMinor > 0 ? pkg.priceMinor : null);
  const currency = extra.currency ?? pkg?.currency ?? 'EGP';
  return {
    الاسم: client.name.trim().split(/\s+/)[0] ?? client.name,
    الموعد: extra.startsAt != null ? sessionWhen(extra.startsAt) : undefined,
    الباقة: packageLabel,
    المبلغ: amountMinor ? formatMoney(amountMinor, currency) : undefined,
  };
}
