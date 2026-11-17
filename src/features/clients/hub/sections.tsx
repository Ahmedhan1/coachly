import { toIsoDate, type Client, type Payment, type Session } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, Icon, ListRow, ListSection, Money, Num, PackageRing, Tx } from '@/ui';
import { formatIsoDate, formatMoney, formatNumber, timeParts } from '@/ui/format';
import styles from '../ClientDetail.module.css';

/** Sections shared by the hub tabs (moved from the single-page client screen). */

export function PackageSection({ client, next, onEdit, onRenew }: { client: Client; next: Session | null; onEdit: () => void; onRenew: () => void }) {
  const pkg = client.package;
  if (!pkg || pkg.totalSessions <= 0) {
    return (
      <ListSection title={t('clientDetail.package')}>
        <div className={styles.pkgEmpty}>
          <p className={styles.pkgTitle}>{t('clientDetail.noPackage')}</p>
          <p className={styles.pkgSub}>{t('clientDetail.noPackageBody')}</p>
          <div className={styles.chips}>
            <Button size="small" icon="plus" onClick={onEdit}>
              {t('clientDetail.addPackage')}
            </Button>
          </div>
        </div>
      </ListSection>
    );
  }
  const left = Math.max(0, client.remainingSessions);
  const attended = Math.max(0, pkg.totalSessions - left);
  const nextTime = next ? timeParts(next.startsAt) : null;
  const nextIsToday = next ? toIsoDate(new Date(next.startsAt)) === toIsoDate(new Date()) : false;
  return (
    <ListSection title={t('clientDetail.package')}>
      <div className={styles.pkg}>
        <PackageRing
          total={pkg.totalSessions}
          remaining={left}
          label={t('clientDetail.ringLabel', { left, total: pkg.totalSessions })}
          caption={t('clientDetail.ringLeft')}
        />
        <div className={styles.pkgText}>
          <h3 className={styles.pkgTitle}>
            <Tx k="clientDetail.remainingOf" params={{ left, total: pkg.totalSessions }} />
          </h3>
          {client.startDate && client.endDate && (
            <p className={styles.pkgSub}>
              <Tx k="clientDetail.period" params={{ start: formatIsoDate(client.startDate), end: formatIsoDate(client.endDate) }} />
            </p>
          )}
          {pkg.priceMinor > 0 && (
            <p className={styles.pkgSub}>
              <Money minor={pkg.priceMinor} currency={pkg.currency} />
            </p>
          )}
          <div className={styles.chips}>
            <Badge>
              <Num>{attended}</Num>
              {t('clientDetail.attended')}
            </Badge>
            {next && nextTime && (
              <Badge tone="brand">
                {nextIsToday ? t('home.title') : formatIsoDate(toIsoDate(new Date(next.startsAt)))} <Num>{nextTime.clock}</Num> {nextTime.period}
              </Badge>
            )}
          </div>
          <div className={styles.chips}>
            <Button size="small" variant="secondary" icon="edit" onClick={onEdit}>
              {t('clientDetail.editPackage')}
            </Button>
            <Button size="small" variant="secondary" icon="undo" onClick={onRenew}>
              {t('clientDetail.renew')}
            </Button>
          </div>
        </div>
      </div>
    </ListSection>
  );
}

export function MeasurementsSection({ client }: { client: Client }) {
  const m = client.measurements;
  const items = [
    m.weightKg !== undefined && { label: t('clientDetail.weight'), value: m.weightKg, unit: t('clientDetail.kg') },
    m.heightCm !== undefined && { label: t('clientDetail.height'), value: m.heightCm, unit: t('clientDetail.cm') },
    m.bodyFatPercent !== undefined && { label: t('clientDetail.bodyFat'), value: m.bodyFatPercent, unit: t('clientDetail.percent') },
    m.waistCm !== undefined && { label: t('clientDetail.waist'), value: m.waistCm, unit: t('clientDetail.cm') },
  ].filter((x): x is { label: string; value: number; unit: string } => Boolean(x));
  return (
    <ListSection title={t('clientDetail.goal')}>
      <div className={styles.goal}>
        <p className={styles.goalLabel}>
          <Icon name="target" />
          {t(`goals.${client.goal}`)}
        </p>
        {client.goalNote && <p className={styles.goalText}>{client.goalNote}</p>}
        {items.length > 0 && (
          <dl className={styles.facts} aria-label={t('clientDetail.measurements')}>
            {items.slice(0, 3).map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <Num>{formatNumber(item.value)}</Num>
                  <span>{item.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </ListSection>
  );
}

export function InjuriesSection({ client }: { client: Client }) {
  return (
    <ListSection title={t('clientDetail.injuries')} count={client.injuries.length || undefined}>
      {client.injuries.length === 0 ? (
        <ListRow leading={<Icon name="check" />} title={t('clientDetail.noInjuries')} />
      ) : (
        client.injuries.map((injury) => (
          <div key={injury} className={styles.injury}>
            <span className={styles.injuryBadge}>
              <Icon name="bandage" />
            </span>
            <p>{injury}</p>
          </div>
        ))
      )}
    </ListSection>
  );
}

export function PaymentsSection({ payments, today, owed, currency, onAdd, onOpen }: { payments: Payment[]; today: string; owed: number; currency: string; onAdd: () => void; onOpen: (p: Payment) => void }) {
  return (
    <ListSection
      title={t('clientDetail.payments')}
      footer={owed > 0 ? t('schedule.pay.balance', { amount: formatMoney(owed, currency) }) : undefined}
      action={
        <Button size="small" variant="plain" icon="plus" onClick={onAdd}>
          {t('clientDetail.addPayment')}
        </Button>
      }
    >
      {payments.length === 0 ? (
        <ListRow leading={<Icon name="wallet" />} title={t('clientDetail.noPayments')} />
      ) : (
        payments.map((p) => (
          <ListRow
            key={p.id}
            title={<Money minor={p.amountMinor} currency={p.currency} className={styles.amount} />}
            subtitle={
              <>
                {formatIsoDate(p.paidOn ?? p.dueOn ?? today)} · {t(`clientDetail.methods.${p.method}`)}
              </>
            }
            trailing={<Badge tone={p.status === 'paid' ? 'ok' : 'warning'}>{p.status === 'paid' ? t('clientDetail.paid') : t('clientDetail.due')}</Badge>}
            onClick={() => onOpen(p)}
          />
        ))
      )}
    </ListSection>
  );
}
