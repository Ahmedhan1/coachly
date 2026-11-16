import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { subscriptionAttention, toIsoDate, type Client, type Payment, type Session } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, Icon, ListRow, ListSection, Money, Num, PackageRing, PageHeader, Tx } from '@/ui';
import { formatIsoDate, formatNumber, timeParts } from '@/ui/format';
import { attentionLabel, attentionTone } from './attention';
import { telUrl, whatsappUrl } from './contact';
import { useDeleteClient } from './useDeleteClient';
import styles from './ClientDetail.module.css';

const BACK = { to: '/clients', label: t('clientDetail.back') };

export function ClientDetailScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  // null = loaded but missing; undefined = still loading
  const client = useLive(async () => (await repos.clients.get(clientId)) ?? null, [repos, clientId]);
  const payments = useLive(() => repos.payments.listByClient(clientId), [repos, clientId]);
  const sessions = useLive(() => repos.sessions.listByClient(clientId), [repos, clientId]);

  if (client === undefined) return <PageHeader title="" back={BACK} />;
  if (client === null) {
    return (
      <>
        <PageHeader title="" back={BACK} />
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  return <ClientDetail client={client} payments={payments ?? []} sessions={sessions ?? []} />;
}

function nextSessionOf(sessions: Session[], now: number): Session | null {
  return (
    sessions
      .filter((s) => s.attendance === 'scheduled' && s.startsAt + s.durationMin * 60_000 > now)
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}

function ClientDetail({ client, payments, sessions }: { client: Client; payments: Payment[]; sessions: Session[] }) {
  const navigate = useNavigate();
  const deleteClient = useDeleteClient();
  const [now] = useState(() => Date.now());
  const today = toIsoDate(new Date(now));
  const attention = subscriptionAttention(client, today);
  const next = nextSessionOf(sessions, now);
  const wa = whatsappUrl(client.phone);

  const onDelete = async () => {
    await deleteClient(client);
    navigate('/clients', { replace: true });
  };

  return (
    <>
      <PageHeader
        title=""
        back={BACK}
        actions={
          client.phone ? (
            <a className={styles.roundLink} href={telUrl(client.phone)} aria-label={t('clientDetail.call')} title={t('clientDetail.call')}>
              <Icon name="phone" />
            </a>
          ) : undefined
        }
      />
      <header className={styles.who}>
        <div className={styles.photo} aria-hidden="true">
          <Icon name="user" />
        </div>
        <div className={styles.whoText}>
          <h1 className={styles.name}>{client.name}</h1>
          <p className={styles.meta}>
            {t(`goals.${client.goal}`)}
            {client.phone && (
              <>
                {' · '}
                <bdi className="num">{client.phone}</bdi>
              </>
            )}
          </p>
          {attention && (
            <p className={styles.attention}>
              <Badge tone={attentionTone(attention)}>{attentionLabel(attention)}</Badge>
            </p>
          )}
        </div>
      </header>

      <PackageSection client={client} next={next} />
      <MeasurementsSection client={client} />
      <InjuriesSection client={client} />
      <PaymentsSection payments={payments} today={today} />

      <ListSection title={t('clientDetail.notes')}>
        <p className={client.notes ? styles.note : `${styles.note} ${styles.muted}`}>{client.notes || t('clientDetail.noNotes')}</p>
      </ListSection>

      <div className={styles.dangerZone}>
        <Button variant="danger" icon="trash" onClick={() => void onDelete()}>
          {t('clientDetail.deleteClient')}
        </Button>
      </div>

      <nav className={styles.actionbar} aria-label={t('clientDetail.actions')}>
        {wa ? (
          <a className={styles.stack} href={wa} target="_blank" rel="noreferrer">
            <Icon name="chat" />
            {t('clientDetail.whatsapp')}
          </a>
        ) : (
          <span className={styles.stack} aria-disabled="true">
            <Icon name="chat" />
            {t('clientDetail.whatsapp')}
          </span>
        )}
        <button type="button" className={styles.stack} aria-label={t('clientDetail.bookLabel')} onClick={() => navigate('/schedule')}>
          <Icon name="calendarPlus" />
          {t('clientDetail.book')}
        </button>
        <Button size="large" icon="send" className={styles.primary} onClick={() => navigate('/more/pdf')}>
          {t('clientDetail.sendProgram')}
        </Button>
      </nav>
    </>
  );
}

function PackageSection({ client, next }: { client: Client; next: Session | null }) {
  const pkg = client.package;
  if (!pkg || pkg.totalSessions <= 0) {
    return (
      <ListSection title={t('clientDetail.package')}>
        <div className={styles.pkgEmpty}>
          <p className={styles.pkgTitle}>{t('clientDetail.noPackage')}</p>
          <p className={styles.pkgSub}>{t('clientDetail.noPackageBody')}</p>
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
        </div>
      </div>
    </ListSection>
  );
}

function MeasurementsSection({ client }: { client: Client }) {
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

function InjuriesSection({ client }: { client: Client }) {
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

function PaymentsSection({ payments, today }: { payments: Payment[]; today: string }) {
  return (
    <ListSection title={t('clientDetail.payments')}>
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
          />
        ))
      )}
    </ListSection>
  );
}
