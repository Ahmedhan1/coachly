import { useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { useGo } from '@/app/shell/nav';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { bookingConflicts, type BookingRepeat } from '@/domain/attendance';
import { addDays, type Client, type ClientId, type IsoDate, type ProgramId, type Session } from '@/domain/models';
import { weekdayOf, type RecurrenceError, type Weekday } from '@/domain/schedule';
import { sessionWhen } from '@/features/whatsapp/values';
import { t, type TKey } from '@/i18n';
import { Button, Icon, SegmentedControl, Select, Sheet, TextArea, TextField, Tx, cx } from '@/ui';
import { googleCalendarUrl } from '@/services/calendar';
import { addSessionToCalendar, calendarEventFor } from './calendarExport';
import { ClientPicker } from './ClientPicker';
import { useActiveProgram } from '@/features/programs/activePrograms';
import { programDayName } from '@/i18n/programNames';
import { attachSessionDay, readSessionDays } from '@/data/prefs/sessionDays';
import { useScheduleWriter } from './hooks';
import { futureOfSeries } from './scheduleWriter';
import type { SchedulePrefs } from './prefs';
import { deviceZone } from '@/app/deviceZone';
import styles from './Schedule.module.css';

export type BookingTarget = { mode: 'new'; date: IsoDate; clientId: string | null } | { mode: 'edit'; session: Session };

export interface BookingSheetProps {
  target: BookingTarget;
  clients: readonly Client[];
  prefs: SchedulePrefs;
  today: IsoDate;
  onClose: () => void;
  /** Called after a new booking was saved (for the one-time reminders prompt). */
  onBooked: () => void;
}

const FORM_ID = 'booking-form';
const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const WEEK_ORDER: readonly Weekday[] = [6, 0, 1, 2, 3, 4, 5];
const DURATIONS = [30, 45, 60, 75, 90, 120];
const INTERVALS = ['1', '2', '3', '4'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const minuteToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
function timeToMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

interface FormState {
  clientId: string | null;
  date: IsoDate;
  time: string;
  duration: number;
  repeat: boolean;
  weekdays: Weekday[];
  interval: (typeof INTERVALS)[number];
  endMode: 'count' | 'until';
  count: string;
  until: IsoDate;
  notes: string;
}

function initialState(target: BookingTarget, clients: readonly Client[], prefs: SchedulePrefs, head: Session | null, seriesCount: number): FormState {
  const { clock } = deviceZone();
  if (target.mode === 'edit') {
    const s = target.session;
    const local = clock.toLocal(s.startsAt);
    const rule = head?.recurrence ?? null;
    return {
      clientId: s.clientId,
      date: local.date,
      time: minuteToTime(local.minute),
      duration: s.durationMin,
      repeat: rule !== null,
      weekdays: rule ? (rule.byWeekday as Weekday[]) : [weekdayOf(local.date)],
      interval: rule ? (String(Math.min(4, rule.interval)) as FormState['interval']) : '1',
      endMode: rule?.until && rule.count === null && seriesCount === 0 ? 'until' : 'count',
      count: String(Math.max(1, seriesCount || rule?.count || 8)),
      until: rule?.until ?? addDays(local.date, 7 * 8),
      notes: s.notes,
    };
  }
  const client = clients.find((c) => c.id === target.clientId) ?? null;
  const until = client?.endDate && client.endDate > target.date ? client.endDate : addDays(target.date, 7 * 8);
  return {
    clientId: client?.id ?? null,
    date: target.date,
    time: '18:00',
    duration: prefs.defaultDurationMin,
    repeat: false,
    weekdays: [weekdayOf(target.date)],
    interval: '1',
    endMode: client?.endDate && client.endDate > target.date ? 'until' : 'count',
    count: '8',
    until,
    notes: '',
  };
}

/** Add / edit a session: client, day, time, duration, weekly repeat, live conflict warning, notes. */
export function BookingSheet(props: BookingSheetProps) {
  const { data } = useServices();
  const session = props.target.mode === 'edit' ? props.target.session : null;
  // The series context must be loaded before the form state is created.
  const series = useLive(async () => {
    if (!session) return { head: null, future: [] as Session[], all: [] as Session[] };
    const all = await data.repos.sessions.listByClient(session.clientId);
    const head = session.seriesId
      ? (all.filter((s) => s.seriesId === session.seriesId && s.recurrence && s.startsAt <= session.startsAt).sort((a, b) => a.startsAt - b.startsAt).pop() ?? null)
      : null;
    return { head, future: session.seriesId ? await futureOfSeries(data.repos, session) : [session], all };
  }, [data, session]);
  if (!series) return null;
  return <BookingForm {...props} head={series.head} future={series.future} clientSessions={series.all} />;
}

function BookingForm({
  target,
  clients,
  prefs,
  today,
  onClose,
  onBooked,
  head,
  future,
  clientSessions,
}: BookingSheetProps & { head: Session | null; future: Session[]; clientSessions: Session[] }) {
  const { data, meta } = useServices();
  const writer = useScheduleWriter();
  const go = useGo();
  const showToast = useUiStore((s) => s.showToast);
  const session = target.mode === 'edit' ? target.session : null;
  const inSeries = Boolean(session?.seriesId);
  const [form, setForm] = useState<FormState>(() => initialState(target, clients, prefs, head, inSeries ? future.length : 0));
  const [scope, setScope] = useState<'one' | 'series'>('one');
  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const program = useActiveProgram(form.clientId);
  const attachedDay = useLive(async () => (session ? ((await readSessionDays(meta))[session.id] ?? null) : null), [meta, session]);
  // 'auto' = next day in rotation when the session starts; '' = no program; else a day id.
  const [dayChoice, setDayChoice] = useState<string | null>(null);
  const editingOtherProgram = session !== null && session.programId !== null && program !== undefined && session.programId !== (program?.id ?? null);
  const rawDay = dayChoice ?? (session ? (session.programId === null ? '' : (attachedDay ?? 'auto')) : 'auto');
  const dayValue = rawDay === '' || rawDay === 'auto' || program?.days.some((d) => d.id === rawDay) ? rawDay : 'auto';
  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const showRepeat = !inSeries || scope === 'series';
  const startMinute = timeToMinute(form.time);
  const repeat: BookingRepeat | null =
    form.repeat && showRepeat
      ? {
          weekdays: form.weekdays,
          intervalWeeks: Number(form.interval),
          until: form.endMode === 'until' ? form.until : null,
          count: form.endMode === 'count' ? Number.parseInt(form.count, 10) || 0 : null,
        }
      : null;
  const plan = startMinute === null ? null : writer.plan({ date: form.date, startMinute, durationMinutes: form.duration, repeat });
  const planned = plan?.ok ? plan.value : [];
  const from = planned[0]?.startMs ?? 0;
  const to = planned.length > 0 ? (planned[planned.length - 1]?.startMs ?? 0) + 24 * 3600_000 : 0;
  const nearby = useLive(() => (planned.length > 0 ? data.repos.sessions.listBetween(from - 12 * 3600_000, to) : Promise.resolve([])), [data, from, to, planned.length]);
  const ignore = new Set<string>(session ? (scope === 'series' && inSeries ? future.map((s) => s.id) : [session.id]) : []);
  const existing = (nearby ?? [])
    .filter((s) => s.attendance !== 'cancelled')
    .map((s) => ({ id: s.id, startMs: s.startsAt, durationMinutes: s.durationMin, session: s }));
  const conflicts = bookingConflicts(planned, existing, ignore);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? '—';

  const errorText = (code: RecurrenceError) => t(`schedule.sheet.errors.${code}` as TKey);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.clientId) {
      setClientError(t('schedule.sheet.clientRequired'));
      return;
    }
    if (startMinute === null) {
      setError(t('schedule.sheet.invalid'));
      return;
    }
    if (plan && !plan.ok) {
      setError(errorText(plan.error));
      return;
    }
    setSaving(true);
    const linkProgram = program && !editingOtherProgram;
    const programId: ProgramId | null | undefined = linkProgram ? (dayValue === '' ? null : program.id) : undefined;
    const req = { clientId: form.clientId as ClientId, notes: form.notes, date: form.date, startMinute, durationMinutes: form.duration, repeat, programId };
    const name = nameOf(form.clientId);
    const result = session ? await writer.edit(session, req, inSeries ? scope : 'one') : await writer.book(req);
    if (!result.ok) {
      setSaving(false);
      setError(errorText(result.error));
      return;
    }
    const n = result.value.sessions.length;
    if (linkProgram) {
      const day = dayValue === '' || dayValue === 'auto' ? null : dayValue;
      await attachSessionDay(meta, result.value.sessions.map((x) => x.id), day).catch(() => undefined);
    }
    showToast({
      message: session
        ? n > 1
          ? t('schedule.toast.updatedSeries', { n })
          : t('schedule.toast.updated')
        : n > 1
          ? t('schedule.toast.bookedSeries', { n, name })
          : t('schedule.toast.booked', { name }),
      actionLabel: t('common.undo'),
      onAction: () => void result.value.undo(),
      duration: 6000,
    });
    onClose();
    if (!session) onBooked();
  };

  const remove = async () => {
    if (!session) return;
    const rows = inSeries && scope === 'series' ? future : [session];
    const undo = await writer.remove(rows);
    const name = nameOf(session.clientId);
    showToast({
      message: rows.length > 1 ? t('schedule.toast.deletedSeries', { n: rows.length, name }) : t('schedule.toast.deleted', { name }),
      actionLabel: t('common.undo'),
      onAction: () => void undo(),
      duration: 6000,
    });
    onClose();
  };

  const calendarRequest = (s: Session) => {
    const { clock, timeZone } = deviceZone();
    return { session: s, clientSessions, clientName: nameOf(s.clientId), clock, timeZone, alarmMinutesBefore: prefs.alarmMinutesBefore, now: new Date() };
  };
  // Android: Chrome cannot share .ics files; Google Calendar's add-event link always works there.
  const googleLink = session && ANDROID ? googleCalendarUrl(calendarEventFor(calendarRequest(session)), deviceZone().timeZone) : null;

  const toCalendar = (prefer?: 'download') => {
    if (!session) return;
    // Called straight from the tap: no await before the share sheet opens (iOS user activation).
    void addSessionToCalendar(calendarRequest(session), prefer).then((outcome) => {
      if (outcome === 'downloaded') showToast({ message: t('schedule.toast.calendarDownloaded') });
      else if (outcome === 'failed') showToast({ message: t('schedule.toast.calendarFailed') });
    });
  };

  const toggleDay = (d: Weekday) => {
    const has = form.weekdays.includes(d);
    set({ weekdays: has ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] });
  };

  const durations = DURATIONS.includes(form.duration) ? DURATIONS : [...DURATIONS, form.duration].sort((a, b) => a - b);
  const first = conflicts[0];

  return (
    <Sheet
      open
      onClose={onClose}
      title={session ? t('schedule.sheet.editTitle') : t('schedule.sheet.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" type="submit" form={FORM_ID} disabled={saving}>
          {session ? t('schedule.sheet.saveEdit') : t('schedule.sheet.save')}
        </Button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <ClientPicker
          clients={clients}
          value={form.clientId}
          error={clientError}
          onChange={(id) => {
            const picked = clients.find((c) => c.id === id);
            set({
              clientId: id,
              ...(target.mode === 'new' && picked?.endDate && picked.endDate > form.date ? { until: picked.endDate } : {}),
            });
            setClientError(null);
            setDayChoice(null);
          }}
        />
        {inSeries && (
          <SegmentedControl
            label={t('schedule.sheet.scope')}
            options={[
              { value: 'one', label: t('schedule.sheet.scopeOne') },
              { value: 'series', label: t('schedule.sheet.scopeSeries') },
            ]}
            value={scope}
            onChange={setScope}
          />
        )}
        <div className={styles.pair}>
          <TextField
            label={t('schedule.sheet.date')}
            type="date"
            value={form.date}
            min={session ? undefined : today}
            onChange={(e) => {
              const date = e.target.value;
              if (!date) return;
              set({ date, ...(form.weekdays.length <= 1 ? { weekdays: [weekdayOf(date)] } : {}) });
            }}
            ltr
          />
          <TextField label={t('schedule.sheet.time')} type="time" step={300} value={form.time} onChange={(e) => set({ time: e.target.value })} ltr />
        </div>
        <Select
          label={t('schedule.sheet.durationLabel')}
          options={durations.map((d) => ({ value: String(d), label: t('schedule.sheet.minutes', { n: d }) }))}
          value={String(form.duration)}
          onChange={(v) => set({ duration: Number(v) })}
        />
        {showRepeat && (
          <SegmentedControl
            label={t('schedule.sheet.repeat')}
            options={[
              { value: 'once', label: t('schedule.sheet.once') },
              { value: 'weekly', label: t('schedule.sheet.weekly') },
            ]}
            value={form.repeat ? 'weekly' : 'once'}
            onChange={(v) => set({ repeat: v === 'weekly' })}
          />
        )}
        {showRepeat && form.repeat && (
          <div className={styles.repeatBox}>
            <fieldset className={styles.days}>
              <legend className={styles.fieldLabel}>{t('schedule.sheet.days')}</legend>
              <div className={styles.dayChips}>
                {WEEK_ORDER.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cx(styles.dayChip, form.weekdays.includes(d) && styles.dayChipOn)}
                    aria-pressed={form.weekdays.includes(d)}
                    aria-label={t(`schedule.weekdays.${d}` as TKey)}
                    onClick={() => toggleDay(d)}
                  >
                    {t(`schedule.weekdaysShort.${d}` as TKey)}
                  </button>
                ))}
              </div>
            </fieldset>
            <Select
              label={t('schedule.sheet.every')}
              options={INTERVALS.map((v) => ({ value: v, label: t(`schedule.sheet.everyWeeks.${v}` as TKey) }))}
              value={form.interval}
              onChange={(v) => set({ interval: v })}
            />
            <SegmentedControl
              label={t('schedule.sheet.ends')}
              options={[
                { value: 'count', label: t('schedule.sheet.endsCount') },
                { value: 'until', label: t('schedule.sheet.endsUntil') },
              ]}
              value={form.endMode}
              onChange={(v) => set({ endMode: v })}
            />
            {form.endMode === 'count' ? (
              <TextField
                label={t('schedule.sheet.count')}
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.count}
                onChange={(e) => set({ count: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                ltr
              />
            ) : (
              <TextField
                label={t('schedule.sheet.until')}
                type="date"
                value={form.until}
                min={form.date}
                onChange={(e) => e.target.value && set({ until: e.target.value })}
                ltr
              />
            )}
            {plan?.ok && (
              <p className={styles.preview}>
                <Icon name="calendar" />
                <Tx k="schedule.sheet.preview" params={{ n: planned.length }} />
              </p>
            )}
          </div>
        )}
        {program && !editingOtherProgram && (
          <Select
            label={t('hub.booking.dayHint', { program: program.name })}
            options={[
              { value: 'auto', label: t('hub.booking.dayAuto') },
              ...program.days.map((d) => ({ value: d.id, label: programDayName(program.days, d.id) })),
              { value: '', label: t('hub.booking.dayNone') },
            ]}
            value={dayValue}
            onChange={(v) => setDayChoice(v)}
          />
        )}
        {first && (
          <div className={styles.conflict} role="status" data-testid="conflict-warning">
            <Icon name="alert" />
            <div>
              <p className={styles.conflictTitle}>{t('schedule.sheet.conflictTitle')}</p>
              <p>{t('schedule.sheet.conflictOne', { name: nameOf(first.with.session.clientId), when: sessionWhen(first.with.startMs) })}</p>
              {conflicts.length > 1 && <p>{t('schedule.sheet.conflictMore', { n: conflicts.length - 1 })}</p>}
              <p className={styles.conflictHint}>{t('schedule.sheet.conflictHint')}</p>
            </div>
          </div>
        )}
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <TextArea
          label={`${t('schedule.sheet.notes')} (${t('common.optional')})`}
          placeholder={t('schedule.sheet.notesPlaceholder')}
          value={form.notes}
          rows={2}
          onChange={(e) => set({ notes: e.target.value })}
        />
        {session && (
          <div className={styles.sheetActions}>
            <Button
              variant="secondary"
              icon="user"
              onClick={() => {
                onClose();
                go(`/clients/${session.clientId}?tab=sessions`);
              }}
            >
              {t('hub.session.openClient', { name: nameOf(session.clientId) })}
            </Button>
            {googleLink ? (
              <>
                <a className={styles.linkButton} href={googleLink} target="_blank" rel="noreferrer">
                  <Icon name="calendarPlus" />
                  {t('schedule.sheet.addToGoogle')}
                </a>
                <Button variant="secondary" icon="file" onClick={() => toCalendar('download')}>
                  {t('schedule.sheet.downloadIcs')}
                </Button>
              </>
            ) : (
              <Button variant="secondary" icon="calendarPlus" onClick={() => toCalendar()}>
                {t('schedule.sheet.addToCalendar')}
              </Button>
            )}
            <Button variant="danger" icon="trash" onClick={() => void remove()}>
              {inSeries && scope === 'series' ? t('schedule.sheet.deleteSeries') : t('schedule.sheet.delete')}
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
