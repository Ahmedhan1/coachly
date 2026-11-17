import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGo } from '@/app/nav';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { FollowUpReason } from '@/domain/clientHub';
import { bookUrl, clientUrl, sessionUrl } from '@/features/clients/hub/links';
import { backupReminder } from '@/domain/backup/reminder';
import { toIsoDate } from '@/domain/models';
import { useUiStore } from '@/app/uiStore';
import { whatsappUrl } from '@/features/clients/contact';
import { OutboxCard } from '@/features/outbox/OutboxCard';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { t } from '@/i18n';
import { Avatar, Badge, Button, Icon, IconButton, ListRow, ListSection, Money, Num, PageHeader, SectionLink, Tx, cx } from '@/ui';
import { formatIsoDate, formatLongDate, formatTime, timeParts } from '@/ui/format';
import type { AgendaItem, NextSession } from './homeModel';
import { useHomeData, type HomeData } from './useHomeData';
import styles from './HomeScreen.module.css';

export function HomeScreen() {
  const home = useHomeData();
  const navigate = useNavigate();
  const openSearch = useUiStore((s) => s.openSearch);
  const actions = (
    <>
      <IconButton icon="search" label={t('hub.search.open')} onClick={openSearch} />
      <button type="button" className={styles.profile} aria-label={t('home.profile')} title={t('home.profile')} onClick={() => navigate('/more')}>
        {(home?.trainerName.trim() || t('app.name')).charAt(0)}
      </button>
    </>
  );
  if (!home) return <PageHeader title={t('home.title')} actions={actions} />;
  return (
    <>
      <PageHeader title={t('home.title')} actions={actions} subtitle={<DateLine home={home} />} />
      <ActiveSessionBanner />
      {home.hasDemo && <DemoNotice />}
      {home.plan.next ? <Hero next={home.plan.next} plan={home.sessionPlans.get(home.plan.next.session.id) ?? null} /> : <NoNext />}
      <OutboxCard />
      <RestOfDay items={home.plan.rest} plans={home.sessionPlans} />
      <EndingSoon home={home} />
      <FollowUp home={home} />
      <BackupLine now={home.now} />
    </>
  );
}

function DateLine({ home }: { home: HomeData }) {
  const date = formatLongDate(home.now);
  if (home.plan.total === 0) return <Tx k="home.dateLineNone" params={{ date }} />;
  return <Tx k="home.dateLine" params={{ date, total: home.plan.total, done: home.plan.done }} />;
}

function DemoNotice() {
  const { data } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  return (
    <section className={styles.demo} aria-labelledby="demo-title">
      <div className={styles.demoText}>
        <h2 id="demo-title" className={styles.demoTitle}>
          {t('home.demoTitle')}
        </h2>
        <p className={styles.demoBody}>{t('home.demoBody')}</p>
      </div>
      <Button
        variant="secondary"
        size="small"
        onClick={async () => {
          await data.removeDemoData();
          showToast({ message: t('home.demoRemoved') });
        }}
      >
        {t('home.demoRemove')}
      </Button>
    </section>
  );
}

function Hero({ next, plan }: { next: NextSession; plan: string | null }) {
  const go = useGo();
  // Session mode picks the booking's program and day (or the client's active program and the next day).
  const startUrl = sessionUrl({ clientId: next.client.id, scheduleId: next.session.id });
  const { clock, period } = timeParts(next.session.startsAt);
  const wa = whatsappUrl(next.client.phone);
  const when =
    next.minutesUntil <= 0 ? (
      t('home.now')
    ) : next.minutesUntil < 90 ? (
      <Tx k="home.inMinutes" params={{ n: next.minutesUntil }} />
    ) : (
      <Tx k="home.inHours" params={{ n: Math.round(next.minutesUntil / 60) }} />
    );
  return (
    <section className={styles.hero} aria-label={t('home.nextLabel')}>
      <p className={styles.heroTop}>
        <i aria-hidden="true" />
        {t('home.next')} · {when}
      </p>
      <p className={styles.heroTime}>
        <Num>{clock}</Num>
        <small>{period}</small>
      </p>
      <button type="button" className={styles.heroWho} onClick={() => go(clientUrl(next.client.id))}>
        {next.client.name}
      </button>
      <p className={styles.heroWhat}>
        {t(`goals.${next.client.goal}`)}
        {next.packageIndex && (
          <>
            {' · '}
            <Tx k="home.sessionOf" params={{ n: next.packageIndex.n, total: next.packageIndex.total }} />
          </>
        )}
      </p>
      {plan && <p className={styles.heroWhat}>{plan}</p>}
      <div className={styles.heroActions}>
        <Button variant="onBrand" icon="timer" className={styles.heroStart} onClick={() => go(startUrl)}>
          {t('home.start')}
        </Button>
        {wa && (
          <a className={styles.heroGhost} href={wa} target="_blank" rel="noreferrer" aria-label={t('home.whatsappTo', { name: next.client.name })}>
            <Icon name="chat" />
          </a>
        )}
      </div>
    </section>
  );
}

function NoNext() {
  const navigate = useNavigate();
  return (
    <section className={styles.noNext} aria-label={t('home.nextLabel')}>
      <h2 className={styles.noNextTitle}>{t('home.noNextTitle')}</h2>
      <p className={styles.noNextBody}>{t('home.noNextBody')}</p>
      <Button icon="calendarPlus" block onClick={() => navigate('/schedule')}>
        {t('home.book')}
      </Button>
    </section>
  );
}

function AgendaTime({ startsAt }: { startsAt: number }) {
  const { clock, period } = timeParts(startsAt);
  return (
    <span className={styles.time}>
      <Num>{clock}</Num>
      <small>{period}</small>
    </span>
  );
}

function RestOfDay({ items, plans }: { items: AgendaItem[]; plans: ReadonlyMap<string, string> }) {
  const navigate = useNavigate();
  return (
    <ListSection title={t('home.rest')} action={<SectionLink onClick={() => navigate('/schedule')}>{t('home.scheduleLink')}</SectionLink>}>
      {items.length === 0 ? (
        <ListRow leading={<Icon name="calendar" />} title={t('home.noRest')} />
      ) : (
        items.map(({ session, client, status }) => (
          <ListRow
            key={session.id}
            to={`/clients/${client.id}`}
            className={cx(styles.agendaRow, status !== 'upcoming' && styles.finished)}
            leading={<AgendaTime startsAt={session.startsAt} />}
            title={status === 'attended' ? <s className={styles.struck}>{client.name}</s> : client.name}
            subtitle={
              <>
                {plans.get(session.id) ?? t(`goals.${client.goal}`)} · <Tx k="home.duration" params={{ min: session.durationMin }} />
              </>
            }
            trailing={
              status === 'attended' ? (
                <Badge tone="ok">
                  <Icon name="check" />
                  {t('home.done')}
                </Badge>
              ) : status === 'missed' ? (
                <Badge tone="danger">{t('home.missed')}</Badge>
              ) : undefined
            }
          />
        ))
      )}
    </ListSection>
  );
}

function EndingSoon({ home }: { home: HomeData }) {
  const go = useGo();
  return (
    <ListSection title={t('home.endingSoon')} count={home.attention.length || undefined}>
      {home.attention.length === 0 ? (
        <ListRow leading={<Icon name="check" />} title={t('home.nothingEnding')} />
      ) : (
        home.attention.map(({ client, attention }) => {
          const hot = attention.kind === 'ended' || (attention.kind === 'ending_soon' && attention.daysLeft <= 3) || attention.kind === 'low_sessions';
          const pkg = client.package;
          return (
            <div key={client.id} className={styles.expRow}>
              <button type="button" className={styles.expMain} onClick={() => go(clientUrl(client.id))}>
                <span className={styles.expName}>{client.name}</span>
                <span className={styles.expSub}>
                  {pkg ? <Tx k="clients.remaining" params={{ n: client.remainingSessions }} /> : t('clients.noPackage')}
                  {pkg && pkg.priceMinor > 0 && (
                    <>
                      {' · '}
                      <Tx k="home.renewPrice" params={{ amount: <Money minor={pkg.priceMinor} currency={pkg.currency} className={styles.money} /> }} />
                    </>
                  )}
                </span>
              </button>
              <Button
                size="small"
                variant={hot ? 'primary' : 'secondary'}
                aria-label={t('home.renewFor', { name: client.name })}
                onClick={() => go(`/clients/${client.id}?renew=1`)}
              >
                {t('home.renew')}
              </Button>
              <span className={cx(styles.expLeft, hot && styles.hot)}>
                {attention.kind === 'ended' ? (
                  <b>{t('home.ended')}</b>
                ) : (
                  <b>
                    <Num>{attention.kind === 'ending_soon' ? attention.daysLeft : attention.remaining}</Num>
                  </b>
                )}
                <small>{attention.kind === 'low_sessions' ? t('home.sessions') : attention.kind === 'ending_soon' ? t('home.days') : ''}</small>
              </span>
            </div>
          );
        })
      )}
    </ListSection>
  );
}

const FOLLOW_UP_SHOWN = 6;

function ReasonText({ reason, currency }: { reason: FollowUpReason; currency: string }) {
  switch (reason.kind) {
    case 'overdue_payment': {
      const amount = <Money minor={reason.amountMinor} currency={currency} className={styles.money} />;
      return reason.daysLate > 0 ? <Tx k="hub.followUp.overdue" params={{ amount, n: reason.daysLate }} /> : <Tx k="hub.followUp.overdueToday" params={{ amount }} />;
    }
    case 'no_session_week':
      return <>{t('hub.followUp.noSession')}</>;
    case 'missed_checkin':
      return reason.days === null ? <>{t('hub.followUp.checkInNever')}</> : <Tx k="hub.followUp.checkIn" params={{ n: reason.days }} />;
  }
}

/** Clients who need a look today, each with the one tap that fixes the most urgent reason. */
function FollowUp({ home }: { home: HomeData }) {
  const go = useGo();
  const [all, setAll] = useState(false);
  const shown = all ? home.followUp : home.followUp.slice(0, FOLLOW_UP_SHOWN);
  return (
    <ListSection title={t('hub.followUp.title')} count={home.followUp.length || undefined}>
      {home.followUp.length === 0 ? (
        <ListRow leading={<Icon name="check" />} title={t('hub.followUp.none')} />
      ) : (
        shown.map(({ client, reasons }) => {
          const top = reasons[0];
          const wa = whatsappUrl(client.phone);
          return (
            <div key={client.id} className={styles.followRow}>
              <ListRow
                to={clientUrl(client.id, top?.kind === 'overdue_payment' ? 'payments' : top?.kind === 'no_session_week' ? 'sessions' : 'progress')}
                className={styles.followLink}
                leading={<Avatar name={client.name} />}
                title={client.name}
                subtitle={reasons.map((r, i) => (
                  <span key={r.kind}>
                    {i > 0 && ' · '}
                    <ReasonText reason={r} currency={home.currency} />
                  </span>
                ))}
              />
              {top?.kind === 'overdue_payment' && (
                <Button size="small" className={styles.followBtn} aria-label={t('hub.followUp.payFor', { name: client.name })} onClick={() => go(`/clients/${client.id}?tab=payments&pay=1`)}>
                  {t('hub.followUp.pay')}
                </Button>
              )}
              {top?.kind === 'no_session_week' && (
                <Button size="small" variant="secondary" className={styles.followBtn} aria-label={t('hub.followUp.bookFor', { name: client.name })} onClick={() => go(bookUrl(client.id))}>
                  {t('hub.followUp.book')}
                </Button>
              )}
              {top?.kind === 'missed_checkin' && wa && (
                <a className={styles.followAction} href={wa} target="_blank" rel="noreferrer" aria-label={t('hub.followUp.remindFor', { name: client.name })}>
                  <Icon name="chat" />
                </a>
              )}
            </div>
          );
        })
      )}
      {home.followUp.length > FOLLOW_UP_SHOWN && (
        <div className={styles.followMore}>
          <Button size="small" variant="plain" onClick={() => setAll((v) => !v)}>
            {all ? t('hub.followUp.showLess') : t('hub.followUp.showAll', { n: home.followUp.length })}
          </Button>
        </div>
      )}
    </ListSection>
  );
}

function BackupLine({ now }: { now: Date }) {
  const { backup } = useServices();
  const status = useLive(async () => (backup ? backup.local.status() : null), [backup]);
  if (status === undefined) return null;
  const local = status?.lastLocalAt ?? null;
  const cloud = status?.lastCloudAt ?? null;
  const latest = Math.max(local ?? 0, cloud ?? 0) || null;
  const reminder = backupReminder({ lastBackupAt: latest, firstUseAt: null, now });
  const when = (ms: number) => `${formatIsoDate(toIsoDate(new Date(ms)))} ${formatTime(ms)}`;
  return (
    <ListSection title={t('home.lastBackup')}>
      <ListRow
        to="/more/settings/backup"
        className={cx(styles.backupRow, reminder.due && styles.backupDue)}
        leading={<Icon name={reminder.due ? 'alert' : 'cloudOk'} />}
        title={latest === null ? t('home.noBackupYet') : when(latest)}
        subtitle={
          latest === null
            ? t('home.backupHint')
            : reminder.due
              ? t('home.backupDue', { n: reminder.daysSince ?? 0 })
              : cloud !== null && cloud === latest
                ? t('home.backupCloud')
                : t('home.backupLocal')
        }
      />
    </ListSection>
  );
}
