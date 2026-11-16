import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { matchesQuery } from '@/data';
import type { MarkStatus } from '@/domain/attendance';
import { markOf } from '@/domain/attendance';
import { addDays, type Client, type IsoDate, type Session } from '@/domain/models';
import { isIsoDate, weekDates, weekdayOf } from '@/domain/schedule';
import { t, type TKey } from '@/i18n';
import { Button, EmptyState, Icon, IconButton, ListSection, Num, PageHeader, SearchField, SegmentedControl, Tx, cx } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { BookingSheet, type BookingTarget } from './BookingSheet';
import { useMinuteNow, useScheduleWriter } from './hooks';
import { PrefsSheet } from './PrefsSheet';
import { DEFAULT_SCHEDULE_PREFS, useLateCancelIds, useSchedulePrefs } from './prefs';
import { shouldShowRemindersPrompt } from './reminders';
import { RemindersSheet } from './RemindersSheet';
import { SessionRow } from './SessionRow';
import { deviceZone } from './zone';
import styles from './Schedule.module.css';

type View = 'day' | 'week';
const SEARCH_DAYS = 120;

const weekdayName = (date: IsoDate) => t(`schedule.weekdays.${weekdayOf(date)}` as TKey);
const weekdayShort = (date: IsoDate) => t(`schedule.weekdaysShort.${weekdayOf(date)}` as TKey);

/** المواعيد: a Saturday-first week strip, the selected day's sessions with attendance, and a week overview. */
export function ScheduleScreen() {
  const { data, meta } = useServices();
  const repos = data.repos;
  const writer = useScheduleWriter();
  const showToast = useUiStore((s) => s.showToast);
  const openAddClient = useUiStore((s) => s.openAddClient);
  const [params, setParams] = useSearchParams();
  const now = useMinuteNow();
  const { clock } = deviceZone();
  const today = clock.toLocal(now.getTime()).date;
  const paramDate = params.get('date');
  const [selected, setSelected] = useState<IsoDate>(() => (paramDate && isIsoDate(paramDate) ? paramDate : today));
  const [view, setView] = useState<View>('day');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<BookingTarget | null>(() =>
    params.get('book') ? { mode: 'new', date: selected, clientId: params.get('client') } : null,
  );
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);

  // "?book=1&client=…" (from client detail / quick add) opens the sheet once; drop it from the URL.
  useEffect(() => {
    if (params.has('book')) setParams({}, { replace: true });
  }, [params, setParams]);

  const days = weekDates(selected);
  const weekStart = days[0] ?? selected;
  const rangeStart = clock.toEpochMs({ date: weekStart, minute: 0 });
  const rangeEnd = clock.toEpochMs({ date: addDays(weekStart, 7), minute: 0 });
  const week = useLive(() => repos.sessions.listBetween(rangeStart, rangeEnd), [repos, rangeStart, rangeEnd]);
  const clients = useLive(() => repos.clients.list(), [repos]);
  const nowMs = now.getTime();
  const searching = query.trim().length > 0;
  const upcoming = useLive(
    () => (searching ? repos.sessions.listBetween(nowMs - 3600_000, nowMs + SEARCH_DAYS * 86_400_000) : Promise.resolve([])),
    [repos, searching, Math.floor(nowMs / 3600_000)],
  );
  const lateIds = useLateCancelIds();
  const prefs = useSchedulePrefs() ?? DEFAULT_SCHEDULE_PREFS;

  const byId = new Map((clients ?? []).map((c) => [c.id, c] as const));
  const live = (week ?? []).filter((s) => s.attendance !== 'cancelled');
  const dateOf = (s: Session) => clock.toLocal(s.startsAt).date;
  const dayItems = live.filter((s) => dateOf(s) === selected);
  const nextId = live.find((s) => s.attendance === 'scheduled' && s.startsAt + s.durationMin * 60_000 > nowMs)?.id;

  const openNew = (date: IsoDate = selected, clientId: string | null = null) => setTarget({ mode: 'new', date: date < today ? today : date, clientId });
  const pickDay = (date: IsoDate) => {
    setSelected(date);
    setView('day');
  };

  const mark = async (session: Session, client: Client | undefined, tapped: MarkStatus) => {
    const current = markOf(session.attendance, lateIds.has(session.id));
    const next = current === tapped ? null : tapped;
    const result = await writer.mark(session, next);
    const name = client?.name ?? '';
    const status = next ? t(`schedule.attendance.${next}`) : t('schedule.attendance.cleared');
    const remaining = result.client?.package ? ` · ${t('schedule.attendance.remainingNow', { n: result.client.remainingSessions })}` : '';
    showToast({
      message: `${next ? t('schedule.attendance.marked', { name, status }) : status}${remaining}`,
      actionLabel: t('common.undo'),
      onAction: () => void result.undo(),
    });
  };

  const onBooked = async () => {
    if (await shouldShowRemindersPrompt(meta, new Date())) setRemindersOpen(true);
  };

  const subtitle =
    view === 'day' ? (
      <>
        {weekdayName(selected)} {formatIsoDate(selected)}
        {week && (
          <>
            {' · '}
            <Tx k="schedule.dayCount" params={{ n: dayItems.length }} />
          </>
        )}
      </>
    ) : (
      <Tx k="schedule.weekRange" params={{ from: formatIsoDate(weekStart), to: formatIsoDate(addDays(weekStart, 6)) }} />
    );

  const noClients = clients !== undefined && clients.length === 0;

  return (
    <>
      <PageHeader
        title={t('schedule.title')}
        subtitle={subtitle}
        actions={
          <>
            <IconButton icon="settings" label={t('schedule.settings')} onClick={() => setPrefsOpen(true)} />
            <IconButton icon="plus" label={t('schedule.book')} onClick={() => openNew()} />
          </>
        }
      />
      <div className={styles.body}>
        <SearchField
          value={query}
          onChange={setQuery}
          label={t('schedule.searchLabel')}
          placeholder={t('schedule.searchPlaceholder')}
          clearLabel={t('common.clearSearch')}
        />
        {!searching && (
          <>
            <div className={styles.viewToggle}>
              <SegmentedControl
                label={t('schedule.view')}
                options={[
                  { value: 'day', label: t('schedule.viewDay') },
                  { value: 'week', label: t('schedule.viewWeek') },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
            <WeekStrip days={days} selected={selected} today={today} sessions={live} dateOf={dateOf} onPick={pickDay} onShift={(n) => setSelected(addDays(selected, n * 7))} onToday={() => setSelected(today)} />
          </>
        )}
      </div>

      {searching ? (
        <SearchResults query={query} sessions={upcoming ?? []} byId={byId} lateIds={lateIds} dateOf={dateOf} onOpen={(s) => setTarget({ mode: 'edit', session: s })} onMark={mark} />
      ) : noClients ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon="users"
            title={t('schedule.noClientsTitle')}
            body={t('schedule.noClientsBody')}
            action={
              <Button icon="plus" onClick={openAddClient}>
                {t('schedule.addClient')}
              </Button>
            }
          />
        </div>
      ) : view === 'day' ? (
        week &&
        (dayItems.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              icon="calendar"
              title={t('schedule.emptyDayTitle')}
              body={t('schedule.emptyDayBody')}
              action={
                <Button icon="calendarPlus" onClick={() => openNew()}>
                  {t('schedule.book')}
                </Button>
              }
            />
          </div>
        ) : (
          <ListSection label={t('schedule.title')} className={styles.dayList}>
            {dayItems.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                client={byId.get(s.clientId)}
                lateCancel={lateIds.has(s.id)}
                isNext={s.id === nextId}
                onOpen={() => setTarget({ mode: 'edit', session: s })}
                onMark={(m) => void mark(s, byId.get(s.clientId), m)}
              />
            ))}
          </ListSection>
        ))
      ) : (
        <WeekList days={days} today={today} sessions={live} dateOf={dateOf} byId={byId} onPick={pickDay} />
      )}

      {!searching && !noClients && (
        <div className={styles.bookBar}>
          <Button icon="calendarPlus" block size="large" onClick={() => openNew()}>
            {t('schedule.book')}
          </Button>
        </div>
      )}

      {target && clients && (
        <BookingSheet target={target} clients={clients} prefs={prefs} today={today} onClose={() => setTarget(null)} onBooked={() => void onBooked()} />
      )}
      {prefsOpen && <PrefsSheet prefs={prefs} onClose={() => setPrefsOpen(false)} />}
      {remindersOpen && <RemindersSheet onClose={() => setRemindersOpen(false)} />}
    </>
  );
}

interface WeekStripProps {
  days: IsoDate[];
  selected: IsoDate;
  today: IsoDate;
  sessions: Session[];
  dateOf: (s: Session) => IsoDate;
  onPick: (d: IsoDate) => void;
  onShift: (weeks: number) => void;
  onToday: () => void;
}

function WeekStrip({ days, selected, today, sessions, dateOf, onPick, onShift, onToday }: WeekStripProps) {
  const first = days[0] ?? selected;
  const last = days[6] ?? selected;
  const thisWeek = today >= first && today <= last;
  return (
    <nav className={styles.strip} aria-label={t('schedule.weekStrip')}>
      <div className={styles.stripNav}>
        <IconButton icon="chevronBack" tone="muted" label={t('schedule.prevWeek')} onClick={() => onShift(-1)} />
        <span className={styles.stripRange}>
          <Tx k="schedule.weekRange" params={{ from: formatIsoDate(first), to: formatIsoDate(last) }} />
        </span>
        {!thisWeek && (
          <button type="button" className={styles.todayLink} onClick={onToday}>
            {t('schedule.goToday')}
          </button>
        )}
        <IconButton icon="chevronForward" tone="muted" label={t('schedule.nextWeek')} onClick={() => onShift(1)} />
      </div>
      <ol className={styles.days}>
        {days.map((d) => {
          const n = sessions.filter((s) => dateOf(s) === d).length;
          return (
            <li key={d}>
              <button
                type="button"
                className={cx(styles.day, d === selected && styles.daySelected, d === today && styles.dayToday)}
                aria-pressed={d === selected}
                aria-current={d === today ? 'date' : undefined}
                aria-label={t('schedule.dayCountLabel', { day: `${weekdayName(d)} ${formatIsoDate(d)}`, n })}
                onClick={() => onPick(d)}
              >
                <span className={styles.dayName}>{weekdayShort(d)}</span>
                <span className={styles.dayNum}>
                  <Num>{Number(d.slice(8))}</Num>
                </span>
                <span className={styles.dayCount}>{n > 0 ? <Num>{n}</Num> : <i aria-hidden="true" />}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface WeekListProps {
  days: IsoDate[];
  today: IsoDate;
  sessions: Session[];
  dateOf: (s: Session) => IsoDate;
  byId: Map<string, Client>;
  onPick: (d: IsoDate) => void;
}

function WeekList({ days, today, sessions, dateOf, byId, onPick }: WeekListProps) {
  return (
    <ListSection label={t('schedule.viewWeek')} className={styles.dayList}>
      {days.map((d) => {
        const items = sessions.filter((s) => dateOf(s) === d);
        const names = items.map((s) => byId.get(s.clientId)?.name.split(' ')[0] ?? '—').join('، ');
        return (
          <button key={d} type="button" className={cx(styles.weekRow, d === today && styles.weekRowToday)} onClick={() => onPick(d)}>
            <span className={styles.weekDate}>
              <b>{weekdayName(d)}</b>
              <small>{formatIsoDate(d)}</small>
            </span>
            <span className={styles.weekNames}>{items.length > 0 ? names : t('schedule.noneThatDay')}</span>
            <span className={cx(styles.weekCount, items.length === 0 && styles.weekCountZero)}>
              <Num>{items.length}</Num>
            </span>
            <Icon name="chevronForward" className={styles.chevron} />
          </button>
        );
      })}
    </ListSection>
  );
}

interface SearchResultsProps {
  query: string;
  sessions: Session[];
  byId: Map<string, Client>;
  lateIds: ReadonlySet<string>;
  dateOf: (s: Session) => IsoDate;
  onOpen: (s: Session) => void;
  onMark: (s: Session, c: Client | undefined, m: MarkStatus) => Promise<void>;
}

function SearchResults({ query, sessions, byId, lateIds, dateOf, onOpen, onMark }: SearchResultsProps) {
  const hits = sessions.filter((s) => s.attendance !== 'cancelled' && matchesQuery([byId.get(s.clientId)?.name ?? '', s.notes], query));
  if (hits.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <EmptyState icon="search" title={t('schedule.noResultsTitle')} body={t('schedule.noResultsBody')} />
      </div>
    );
  }
  return (
    <ListSection title={t('schedule.searchResults')} count={hits.length} className={styles.dayList}>
      {hits.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          client={byId.get(s.clientId)}
          lateCancel={lateIds.has(s.id)}
          isNext={false}
          dayLabel={`${weekdayName(dateOf(s))} ${formatIsoDate(dateOf(s))}`}
          onOpen={() => onOpen(s)}
          onMark={(m) => void onMark(s, byId.get(s.clientId), m)}
        />
      ))}
    </ListSection>
  );
}
