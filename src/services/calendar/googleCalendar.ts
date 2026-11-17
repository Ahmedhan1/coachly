import { formatLocal, type IcsEvent } from '@/domain/calendar';
import { addDays } from '@/domain/models';
import { firstOccurrenceDate, type LocalDateTime, type Weekday } from '@/domain/schedule';

/**
 * Android fallback for "أضف للتقويم": Chrome on Android cannot share .ics files and Google Calendar does
 * not always open a downloaded one, but it always opens this "add event" link (app or web), with the
 * weekly rule. Exceptions (EXDATE) and the alarm are not expressible here; Google applies its default
 * reminder.
 */
const BASE = 'https://calendar.google.com/calendar/render';
const BYDAY: Record<Weekday, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
const ORDER: readonly Weekday[] = [6, 0, 1, 2, 3, 4, 5];

function plus(start: LocalDateTime, minutes: number): LocalDateTime {
  const total = start.minute + minutes;
  return { date: addDays(start.date, Math.floor(total / 1440)), minute: total % 1440 };
}

export function googleCalendarUrl(event: IcsEvent, timeZone: string): string {
  let start: LocalDateTime;
  let duration: number;
  let recur: string | null = null;
  if ('recurrence' in event) {
    const r = event.recurrence;
    const first = firstOccurrenceDate(r);
    start = { date: first.ok ? first.value : r.startDate, minute: r.startMinute };
    duration = r.durationMinutes;
    const parts = ['FREQ=WEEKLY'];
    if ((r.intervalWeeks ?? 1) > 1) parts.push(`INTERVAL=${r.intervalWeeks}`);
    parts.push(`BYDAY=${ORDER.filter((d) => r.weekdays.includes(d)).map((d) => BYDAY[d]).join(',')}`, 'WKST=SA');
    if (r.until != null) parts.push(`UNTIL=${r.until.replace(/-/g, '')}`);
    else if (r.count != null) parts.push(`COUNT=${r.count}`);
    recur = `RRULE:${parts.join(';')}`;
  } else {
    start = event.start;
    duration = event.durationMinutes;
  }
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    dates: `${formatLocal(start)}/${formatLocal(plus(start, duration))}`,
    ctz: timeZone,
  });
  if (event.description) q.set('details', event.description);
  if (recur) q.set('recur', recur);
  return `${BASE}?${q.toString()}`;
}
