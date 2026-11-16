import { markOf, type MarkStatus } from '@/domain/attendance';
import type { Client, Session } from '@/domain/models';
import { t } from '@/i18n';
import { Icon, Num, Tx, cx } from '@/ui';
import { timeParts } from '@/ui/format';
import { AttendanceToggle } from './AttendanceToggle';
import styles from './Schedule.module.css';

export interface SessionRowProps {
  session: Session;
  client: Client | undefined;
  lateCancel: boolean;
  isNext: boolean;
  /** Shown before the time in search results (the session's day). */
  dayLabel?: string;
  onOpen: () => void;
  onMark: (mark: MarkStatus) => void;
}

export function SessionRow({ session, client, lateCancel, isNext, dayLabel, onOpen, onMark }: SessionRowProps) {
  const { clock, period } = timeParts(session.startsAt);
  const mark = markOf(session.attendance, lateCancel);
  const name = client?.name ?? '—';
  return (
    <div className={cx(styles.session, isNext && styles.next, mark !== null && styles.marked)} data-testid="session-row">
      <button type="button" className={styles.sessionMain} onClick={onOpen} aria-label={`${name} ${dayLabel ?? ''} ${clock} ${period}`.trim()}>
        <span className={styles.time}>
          <Num>{clock}</Num>
          <small>{period}</small>
        </span>
        <span className={styles.sessionText}>
          <span className={styles.sessionName}>{name}</span>
          <span className={styles.sessionSub}>
            {dayLabel && <>{dayLabel} · </>}
            <Tx k="schedule.duration" params={{ min: session.durationMin }} />
            {session.seriesId && (
              <>
                {' · '}
                {t('schedule.repeats')}
              </>
            )}
            {session.notes.trim() && <> · {session.notes.trim()}</>}
          </span>
        </span>
        <Icon name="chevronForward" className={styles.chevron} />
      </button>
      <AttendanceToggle name={name} value={mark} onChange={onMark} />
    </div>
  );
}
