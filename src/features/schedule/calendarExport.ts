import { seriesExceptions } from '@/domain/attendance';
import { uidFor, type IcsEvent, type IcsOptions } from '@/domain/calendar';
import type { Session } from '@/domain/models';
import type { Weekday, WeeklyRecurrence, ZonedClock } from '@/domain/schedule';
import { t } from '@/i18n';
import { IcsCalendarService, type CalendarService } from '@/services/calendar';
import { BrowserShareService } from '@/services/share/shareService';

/**
 * "أضف للتقويم": the session (or its weekly series) as an .ics file with an alarm, handed to the iOS
 * share sheet (Web Share API) or downloaded when sharing files is not available. Uses the finished
 * calendar service in src/services/calendar.
 */
let service: CalendarService | null = null;
export function calendarService(): CalendarService {
  service ??= new IcsCalendarService(new BrowserShareService());
  return service;
}

export interface CalendarRequest {
  session: Session;
  /** Every live session of the client (the series is taken from them). */
  clientSessions: readonly Session[];
  clientName: string;
  clock: ZonedClock;
  timeZone: string;
  alarmMinutesBefore: number | null;
  now: Date;
}

/** The rule-holding session of a series that covers `session` (latest head at or before it). */
function seriesHead(session: Session, all: readonly Session[]): Session | null {
  if (!session.seriesId) return null;
  return (
    all
      .filter((s) => s.seriesId === session.seriesId && s.recurrence !== null && s.startsAt <= session.startsAt)
      .sort((a, b) => a.startsAt - b.startsAt)
      .pop() ?? null
  );
}

export function calendarEventFor(req: CalendarRequest): IcsEvent {
  const { session, clock } = req;
  const summary = t('schedule.calendar.summary', { name: req.clientName });
  const base = {
    summary,
    description: [t('schedule.calendar.description', { name: req.clientName }), session.notes.trim()].filter(Boolean).join('\n'),
    alarmMinutesBefore: req.alarmMinutesBefore,
  };
  const head = seriesHead(session, req.clientSessions);
  if (head?.recurrence) {
    const start = clock.toLocal(head.startsAt);
    const members = req.clientSessions.filter((s) => s.seriesId === head.seriesId && s.startsAt >= head.startsAt && s.attendance !== 'cancelled');
    const lastDate = members.length > 0 ? clock.toLocal(Math.max(...members.map((s) => s.startsAt))).date : start.date;
    const rule: WeeklyRecurrence = {
      startDate: start.date,
      startMinute: start.minute,
      durationMinutes: head.durationMin,
      weekdays: head.recurrence.byWeekday as Weekday[],
      intervalWeeks: head.recurrence.interval,
      until: head.recurrence.until ?? (head.recurrence.count === null ? lastDate : null),
      count: head.recurrence.count,
    };
    const live = new Set(members.map((s) => clock.toLocal(s.startsAt).date));
    return { ...base, uid: uidFor(head.id), recurrence: { ...rule, exceptions: seriesExceptions(rule, live, lastDate) } };
  }
  return { ...base, uid: uidFor(session.id), start: clock.toLocal(session.startsAt), durationMinutes: session.durationMin };
}

export function icsOptions(req: Pick<CalendarRequest, 'clock' | 'timeZone' | 'now' | 'alarmMinutesBefore'>): IcsOptions {
  return {
    now: req.now,
    clock: req.clock,
    timeZone: req.timeZone,
    defaultAlarmMinutesBefore: req.alarmMinutesBefore,
    calendarName: t('schedule.calendar.calendarName'),
  };
}

/** Builds and shares/downloads the file. Must be called straight from a tap (iOS user activation). */
export async function addSessionToCalendar(req: CalendarRequest, prefer?: 'share' | 'download'): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const result = await calendarService().addToCalendar(
    [calendarEventFor(req)],
    icsOptions(req),
    // ASCII on purpose: Chromium (Android) drops a non-Latin download name and saves "download" with no
    // .ics extension, which no calendar opens. The Arabic title stays inside the file.
    `pt-session-${req.clock.toLocal(req.session.startsAt).date}`,
    { title: t('schedule.calendar.summary', { name: req.clientName }), prefer },
  );
  if (!result.ok) return 'failed';
  return result.value.share.outcome;
}
