import { useNavigate } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { whatsappUrl } from '@/features/clients/contact';
import { OutboxCard } from '@/features/outbox/OutboxCard';
import { t } from '@/i18n';
import { Avatar, Badge, Button, Icon, IconButton, ListRow, ListSection, Money, Num, PageHeader, SectionLink, Tx, cx } from '@/ui';
import { formatLongDate, timeParts } from '@/ui/format';
import type { AgendaItem, NextSession } from './homeModel';
import { useHomeData, type HomeData } from './useHomeData';
import styles from './HomeScreen.module.css';

export function HomeScreen() {
  const home = useHomeData();
  const navigate = useNavigate();
  const actions = (
    <>
      <IconButton icon="search" label={t('home.search')} onClick={() => navigate('/clients')} />
      <button type="button" className={styles.profile} aria-label={t('home.profile')} title={t('home.profile')} onClick={() => navigate('/more')}>
        {(home?.trainerName.trim() || t('app.name')).charAt(0)}
      </button>
    </>
  );
  if (!home) return <PageHeader title={t('home.title')} actions={actions} />;
  return (
    <>
      <PageHeader title={t('home.title')} actions={actions} subtitle={<DateLine home={home} />} />
      {home.hasDemo && <DemoNotice />}
      {home.plan.next ? <Hero next={home.plan.next} /> : <NoNext />}
      <OutboxCard />
      <RestOfDay items={home.plan.rest} />
      <EndingSoon home={home} />
      <FollowUp home={home} />
      <BackupLine />
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

function Hero({ next }: { next: NextSession }) {
  const navigate = useNavigate();
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
      <p className={styles.heroWho}>{next.client.name}</p>
      <p className={styles.heroWhat}>
        {t(`goals.${next.client.goal}`)}
        {next.packageIndex && (
          <>
            {' · '}
            <Tx k="home.sessionOf" params={{ n: next.packageIndex.n, total: next.packageIndex.total }} />
          </>
        )}
      </p>
      <div className={styles.heroActions}>
        <Button variant="onBrand" icon="timer" className={styles.heroStart} onClick={() => navigate(`/clients/${next.client.id}`)}>
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

function RestOfDay({ items }: { items: AgendaItem[] }) {
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
                {t(`goals.${client.goal}`)} · <Tx k="home.duration" params={{ min: session.durationMin }} />
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
  const navigate = useNavigate();
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
              <button type="button" className={styles.expMain} onClick={() => navigate(`/clients/${client.id}`)}>
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
                onClick={() => navigate(`/clients/${client.id}`)}
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

function FollowUp({ home }: { home: HomeData }) {
  return (
    <ListSection title={t('home.followUp')}>
      {home.followUp.length === 0 ? (
        <ListRow leading={<Icon name="check" />} title={t('home.nobodyToFollow')} />
      ) : (
        home.followUp.map(({ client, days }) => {
          const wa = whatsappUrl(client.phone);
          return (
            <div key={client.id} className={styles.followRow}>
              <ListRow
                to={`/clients/${client.id}`}
                className={styles.followLink}
                leading={<Avatar name={client.name} />}
                title={client.name}
                subtitle={days === null ? t('home.followUpNever') : <Tx k="home.followUpDays" params={{ n: days }} />}
              />
              {wa && (
                <a className={styles.followAction} href={wa} target="_blank" rel="noreferrer" aria-label={t('home.whatsappTo', { name: client.name })}>
                  <Icon name="chat" />
                </a>
              )}
            </div>
          );
        })
      )}
    </ListSection>
  );
}

function BackupLine() {
  return (
    <section className={styles.backup} aria-label={t('home.lastBackup')}>
      <Icon name="cloudOk" />
      <p>
        <b>{t('home.noBackupYet')}</b>
        <br />
        {t('home.backupHint')}
      </p>
    </section>
  );
}
