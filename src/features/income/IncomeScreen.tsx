import { useMemo } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { toDayNumber } from '@/domain/schedule';
import { toIsoDate, type Client } from '@/domain/models';
import { t } from '@/i18n';
import type { ReactNode } from 'react';
import { EmptyState, Icon, ListRow, ListSection, Money, PageHeader } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { useWhatsappLinkBuilder } from '@/features/whatsapp/useWhatsappLink';
import { buildIncome } from './incomeModel';
import styles from './Income.module.css';

/** More → الدخل: paid this month against expected, who is late, and who renews soon. */
export function IncomeScreen() {
  const { data } = useServices();
  const settings = useLive(() => data.repos.settings.get(), [data]);
  const clients = useLive(() => data.repos.clients.list(), [data]);
  const renewalLink = useWhatsappLinkBuilder('renewal');
  const today = toIsoDate(new Date());
  // Only the charges this month's dashboard can use (by index), not years of payment history.
  const payments = useLive(() => data.repos.payments.listForIncome(today), [data, today]);
  const anyPayments = useLive(() => data.repos.payments.hasAny(), [data]);

  const dash = useMemo(() => (clients && payments ? buildIncome(clients, payments, today) : undefined), [clients, payments, today]);
  const byId = useMemo(() => new Map<string, Client>((clients ?? []).map((c) => [c.id, c])), [clients]);
  const back = { to: '/more', label: t('screens.more.title') };

  if (!settings || dash === undefined) return <PageHeader title={t('schedule.income.title')} back={back} />;
  const currency = settings.currency;
  if (dash === null) {
    return (
      <>
        <PageHeader title={t('schedule.income.title')} back={back} />
        <EmptyState icon="alert" title={t('schedule.income.title')} body={t('schedule.income.error')} />
      </>
    );
  }
  const nothing = anyPayments === false && dash.expectedRenewals.length === 0;
  const share = dash.expectedThisMonthMinor > 0 ? Math.min(1, dash.paidThisMonthMinor / dash.expectedThisMonthMinor) : 0;

  return (
    <>
      <PageHeader title={t('schedule.income.title')} back={back} subtitle={formatMonth(today)} />
      {nothing ? (
        <EmptyState icon="wallet" title={t('schedule.income.emptyTitle')} body={t('schedule.income.emptyBody')} />
      ) : (
        <>
          <section className={styles.hero} aria-label={t('schedule.income.paid')}>
            <p className={styles.heroLabel}>{t('schedule.income.paid')}</p>
            <Money className={styles.heroValue} minor={dash.paidThisMonthMinor} currency={currency} />
            <div className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t('schedule.income.expected')}>
              <span style={{ inlineSize: `${share * 100}%` }} />
            </div>
            <p className={styles.heroSub}>
              {t('schedule.income.expected')}: <Money minor={dash.expectedThisMonthMinor} currency={currency} />
            </p>
            <p className={styles.hint}>{t('schedule.income.expectedHint')}</p>
          </section>

          <dl className={styles.split}>
            <div>
              <dt>{t('schedule.income.overdueTotal')}</dt>
              <dd className={dash.overdueMinor > 0 ? styles.bad : undefined}>
                <Money minor={dash.overdueMinor} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>{t('schedule.income.dueRest')}</dt>
              <dd>
                <Money minor={dash.dueRestOfMonthMinor} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>{t('schedule.income.renewals')}</dt>
              <dd>
                <Money minor={dash.expectedRenewalsMinor} currency={currency} />
              </dd>
            </div>
          </dl>

          <ListSection title={t('schedule.income.overdue')} count={dash.overdue.length || undefined}>
            {dash.overdue.length === 0 ? (
              <p className={styles.none}>{t('schedule.income.noOverdue')}</p>
            ) : (
              dash.overdue.map((p) => {
                const client = byId.get(p.clientId);
                const late = toDayNumber(today) - toDayNumber(p.dueDate);
                return (
                  <ListRow
                    key={p.id}
                    leading={<Icon name="wallet" />}
                    title={client?.name ?? '—'}
                    subtitle={`${t('schedule.income.lateDays', { n: late })} · ${formatIsoDate(p.dueDate)}`}
                    trailing={<WaTrailing client={client} href={client ? renewalLink(client, { amountMinor: p.amountMinor, currency }) : null} label={client ? t('schedule.income.remindPayment', { name: client.name }) : ''} amount={<Money minor={p.amountMinor} currency={currency} />} />}
                    to={client ? `/clients/${client.id}` : undefined}
                  />
                );
              })
            )}
          </ListSection>

          <ListSection title={t('schedule.income.renewingSoon')} count={dash.renewingSoon.length || undefined}>
            {dash.renewingSoon.length === 0 ? (
              <p className={styles.none}>{t('schedule.income.noRenewing')}</p>
            ) : (
              dash.renewingSoon.map(({ subscription: s, daysLeft }) => {
                const client = byId.get(s.clientId);
                return (
                  <ListRow
                    key={s.id}
                    leading={<Icon name="calendar" />}
                    title={client?.name ?? '—'}
                    subtitle={daysLeft === 0 ? t('schedule.income.endsToday') : t('schedule.income.endsIn', { n: daysLeft })}
                    trailing={<WaTrailing client={client} href={client ? renewalLink(client) : null} label={client ? t('schedule.income.remindRenewal', { name: client.name }) : ''} amount={<Money minor={s.priceMinor} currency={currency} />} />}
                    to={client ? `/clients/${client.id}` : undefined}
                  />
                );
              })
            )}
          </ListSection>
        </>
      )}
    </>
  );
}

function WaTrailing({ client, href, label, amount }: { client: Client | undefined; href: string | null; label: string; amount: ReactNode }) {
  return (
    <span className={styles.trailing}>
      <span className={styles.amount}>{amount}</span>
      {client && href && client.phone && (
        <a className={styles.wa} href={href} target="_blank" rel="noreferrer" aria-label={label} onClick={(e) => e.stopPropagation()}>
          <Icon name="chat" />
        </a>
      )}
    </span>
  );
}

const monthFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
function formatMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return monthFmt.format(new Date(y, m - 1, 1));
}

