import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { splitClientSessions } from '@/domain/clientHub';
import { markOf } from '@/domain/attendance';
import { toIsoDate, type Client, type Session } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, Icon, ListRow, ListSection, Num, Tx } from '@/ui';
import { formatIsoDate, timeParts } from '@/ui/format';
import { AttendanceToggle } from '@/features/schedule/AttendanceToggle';
import { useScheduleWriter } from '@/features/schedule/hooks';
import { useLateCancelIds } from '@/features/schedule/prefs';
import { readSessionDays } from '@/features/schedule/sessionDays';
import { programDayName } from '@/features/programs/names';
import { bookUrl } from './links';
import type { HubData } from './useHubData';
import styles from './Hub.module.css';

const PAST_STEP = 10;

function When({ session }: { session: Session }) {
  const { clock, period } = timeParts(session.startsAt);
  return (
    <>
      {formatIsoDate(toIsoDate(new Date(session.startsAt)))} <Num>{clock}</Num> {period}
    </>
  );
}

/** Upcoming bookings (with the program day) and past sessions with one-tap attendance. */
export function SessionsTab({ client, hub, go }: { client: Client; hub: HubData; go: (to: string) => void }) {
  const { meta } = useServices();
  const writer = useScheduleWriter();
  const showToast = useUiStore((s) => s.showToast);
  const late = useLateCancelIds();
  const days = useLive(() => readSessionDays(meta), [meta]) ?? {};
  const [pastShown, setPastShown] = useState(PAST_STEP);
  const { upcoming, past, counts } = splitClientSessions(hub.sessions, hub.now);
  const programs = [hub.programs.active, ...hub.programs.past].filter((p) => p !== null);
  const dayOf = (s: Session) => {
    const program = programs.find((p) => p.id === s.programId);
    if (!program) return '';
    const name = programDayName(program.days, days[s.id]);
    return name ? `${program.name} · ${name}` : program.name;
  };

  const mark = async (s: Session, tapped: Parameters<typeof writer.mark>[1]) => {
    const current = markOf(s.attendance, late.has(s.id));
    const next = current === tapped ? null : tapped;
    const result = await writer.mark(s, next);
    const status = next ? t(`schedule.attendance.${next}`) : t('schedule.attendance.cleared');
    const remaining = result.client?.package ? ` · ${t('schedule.attendance.remainingNow', { n: result.client.remainingSessions })}` : '';
    showToast({
      message: `${next ? t('schedule.attendance.marked', { name: client.name, status }) : status}${remaining}`,
      actionLabel: t('common.undo'),
      onAction: () => void result.undo(),
    });
  };

  return (
    <>
      <p className={styles.counts}>
        <Tx k="hub.sessions.counts" params={counts} />
        {counts.unmarked > 0 && (
          <>
            {' · '}
            <Tx k="hub.sessions.unmarked" params={{ n: counts.unmarked }} />
          </>
        )}
      </p>
      <div className={styles.actionsRow}>
        <Button icon="calendarPlus" onClick={() => go(bookUrl(client.id))}>
          {t('hub.sessions.book')}
        </Button>
      </div>
      <ListSection title={t('hub.sessions.upcoming')} count={upcoming.length || undefined}>
        {upcoming.length === 0 ? (
          <ListRow leading={<Icon name="calendar" />} title={t('hub.sessions.none')} />
        ) : (
          upcoming.slice(0, 20).map((s) => (
            <ListRow
              key={s.id}
              leading={<Icon name="calendar" />}
              title={<When session={s} />}
              subtitle={dayOf(s) || <Tx k="schedule.duration" params={{ min: s.durationMin }} />}
              to={`/schedule?date=${toIsoDate(new Date(s.startsAt))}`}
            />
          ))
        )}
      </ListSection>
      <ListSection title={t('hub.sessions.past')} count={past.length || undefined}>
        {past.length === 0 ? (
          <ListRow leading={<Icon name="calendar" />} title={t('hub.sessions.pastNone')} />
        ) : (
          past.slice(0, pastShown).map((s) => {
            const m = markOf(s.attendance, late.has(s.id));
            return (
              <div key={s.id} className={styles.pastRow}>
                <span className={styles.pastText}>
                  <span>
                    <When session={s} />
                  </span>
                  <span className={styles.delta}>{s.attendance === 'cancelled' ? <Badge>{t('schedule.attendance.cancelled')}</Badge> : dayOf(s)}</span>
                </span>
                {s.attendance !== 'cancelled' && <AttendanceToggle name={client.name} value={m} onChange={(next) => void mark(s, next)} />}
              </div>
            );
          })
        )}
        {past.length > pastShown && (
          <div className={styles.more}>
            <Button size="small" variant="plain" onClick={() => setPastShown((n) => n + PAST_STEP)}>
              {t('hub.sessions.showMore', { n: past.length - pastShown })}
            </Button>
          </div>
        )}
      </ListSection>
    </>
  );
}
