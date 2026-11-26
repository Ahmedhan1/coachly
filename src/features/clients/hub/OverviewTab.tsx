import type { Client, Session } from '@/domain/models';
import { t } from '@/i18n';
import { Icon, ListRow, ListSection, Money, Num, Tx, type IconName } from '@/ui';
import { formatIsoDate, formatMoney, timeParts } from '@/ui/format';
import { toIsoDate } from '@/domain/models';
import { programDayName } from '@/i18n/programNames';
import { InjuriesSection, MeasurementsSection, PackageSection } from './sections';
import type { HubData } from './useHubData';
import type { HubTab } from './tabs';
import styles from './Hub.module.css';
import base from '../ClientDetail.module.css';

export interface OverviewActions {
  startUrl: string;
  onPay: () => void;
  onRenew: () => void;
  onEditPackage: () => void;
  onPage: (() => void) | null;
  onAi: (() => void) | null;
  onTab: (tab: HubTab) => void;
}

function When({ session, today }: { session: Session; today: string }) {
  const { clock, period } = timeParts(session.startsAt);
  const date = toIsoDate(new Date(session.startsAt));
  return (
    <>
      {date === today ? t('home.title') : formatIsoDate(date)} <Num>{clock}</Num> {period}
    </>
  );
}

/** A tile button: a real link when `to` is given (opened with `onClick`, which keeps the hub as back target). */
function QuickButton({ icon, label, to, onClick }: { icon: IconName; label: string; to?: string; onClick?: () => void }) {
  if (to) {
    return (
      <a
        className={styles.quickBtn}
        href={to}
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
        }}
      >
        <Icon name={icon} />
        {label}
      </a>
    );
  }
  return (
    <button type="button" className={styles.quickBtn} onClick={onClick}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

export function OverviewTab({ client, hub, actions, go }: { client: Client; hub: HubData; actions: OverviewActions; go: (to: string) => void }) {
  const { overview, programs, today, nextDay } = hub;
  const program = programs.active;
  const dayName = program && nextDay ? programDayName(program.days, nextDay.dayId) : '';
  const checkIn = overview.checkInDaysAgo;
  return (
    <>
      <PackageSection client={client} next={overview.next} onEdit={actions.onEditPackage} onRenew={actions.onRenew} />

      <nav className={styles.quick} aria-label={t('hub.overview.actions')}>
        <QuickButton icon="timer" label={t('hub.overview.start')} to={actions.startUrl} onClick={() => go(actions.startUrl)} />
        <QuickButton icon="wallet" label={t('hub.overview.pay')} onClick={actions.onPay} />
        <QuickButton icon="chart" label={t('hub.progress.add')} to={`/clients/${client.id}/progress`} onClick={() => go(`/clients/${client.id}/progress`)} />
        {actions.onPage && <QuickButton icon="share" label={t('hub.overview.page')} onClick={actions.onPage} />}
      </nav>

      <ListSection icon="info" title={t('hub.overview.facts')}>
        <ListRow
          leading={<Icon name="calendar" />}
          title={t('hub.overview.next')}
          subtitle={
            overview.next ? (
              <>
                <When session={overview.next} today={today} />
                {dayName && ` · ${dayName}`}
              </>
            ) : (
              t('hub.overview.noNext')
            )
          }
          trailing={overview.upcomingCount > 1 ? <Tx k="hub.overview.upcomingCount" params={{ n: overview.upcomingCount }} /> : undefined}
          onClick={() => actions.onTab('sessions')}
        />
        <ListRow
          leading={<Icon name="check" />}
          title={t('hub.overview.lastSession')}
          subtitle={overview.lastAttended ? <When session={overview.lastAttended} today={today} /> : t('hub.overview.neverAttended')}
          onClick={() => actions.onTab('sessions')}
        />
        <ListRow
          leading={<Icon name="note" />}
          title={t('hub.overview.lastCheckIn')}
          subtitle={checkIn === null ? t('hub.overview.noCheckIn') : checkIn <= 0 ? t('hub.overview.checkInToday') : <Tx k="hub.overview.checkInDays" params={{ n: checkIn }} />}
          onClick={() => actions.onTab('progress')}
        />
      </ListSection>

      <ListSection icon="money" title={t('clientDetail.payments')}>
        <ListRow
          leading={<Icon name="wallet" />}
          title={
            overview.owedMinor > 0 ? t('schedule.pay.balance', { amount: formatMoney(overview.owedMinor, hub.currency) }) : t('hub.overview.settled')
          }
          subtitle={
            overview.overdueMinor > 0 ? (
              <Tx k="hub.overview.overdue" params={{ amount: <Money minor={overview.overdueMinor} currency={hub.currency} /> }} />
            ) : undefined
          }
          onClick={() => actions.onTab('payments')}
        />
      </ListSection>

      <ListSection icon="dumbbell" title={t('clientDetail.plan')}>
        <ListRow
          leading={<Icon name="list" />}
          title={t('clientDetail.program')}
          subtitle={program ? (dayName ? t('hub.overview.programDay', { program: program.name, day: dayName }) : program.name) : t('clientDetail.programNone')}
          to={program ? `/programs/${program.id}` : `/more/programs?client=${client.id}`}
        />
        {program && <ListRow leading={<Icon name="timer" />} title={t('clientDetail.startSession')} subtitle={t('clientDetail.startSessionHint')} to={actions.startUrl} />}
        <ListRow leading={<Icon name="utensils" />} title={t('clientDetail.nutrition')} to={`/clients/${client.id}/nutrition`} />
        <ListRow leading={<Icon name="note" />} title={t('clientDetail.meals')} to={`/clients/${client.id}/meals`} />
        <ListRow leading={<Icon name="pill" />} title={t('clientDetail.supplements')} to={`/clients/${client.id}/supplements`} />
        <ListRow leading={<Icon name="chart" />} title={t('clientDetail.progress')} to={`/clients/${client.id}/progress`} />
        {actions.onAi && <ListRow leading={<Icon name="edit" />} title={t('settings.ai.title')} subtitle={t('settings.ai.hint')} onClick={actions.onAi} />}
        {actions.onPage && <ListRow leading={<Icon name="share" />} title={t('settings.clientPage.title')} subtitle={t('settings.clientPage.hint')} onClick={actions.onPage} />}
      </ListSection>

      <MeasurementsSection client={client} />
      <InjuriesSection client={client} />
      <ListSection icon="note" title={t('clientDetail.notes')}>
        <p className={client.notes ? base.note : `${base.note} ${base.muted}`}>{client.notes || t('clientDetail.noNotes')}</p>
      </ListSection>
    </>
  );
}
