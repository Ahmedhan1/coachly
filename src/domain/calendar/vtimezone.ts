import { wallMsToLocal, type ZonedClock } from '../schedule/zone';
import { formatLocal, formatOffset } from './format';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export interface OffsetTransition {
  /** First instant (epoch ms) of the new offset. */
  atMs: number;
  fromMinutes: number;
  toMinutes: number;
}

/** Offset changes in [fromMs, toMs], found by scanning daily and bisecting to the minute. */
export function findTransitions(clock: ZonedClock, fromMs: number, toMs: number): OffsetTransition[] {
  const out: OffsetTransition[] = [];
  let t = fromMs;
  let offset = clock.offsetMinutesAt(t);
  while (t < toMs) {
    const next = Math.min(t + MS_PER_DAY, toMs);
    const nextOffset = clock.offsetMinutesAt(next);
    if (nextOffset !== offset) {
      let lo = t; // offset(lo) === offset
      let hi = next; // offset(hi) !== offset
      while (hi - lo > MS_PER_MIN) {
        const mid = lo + Math.floor((hi - lo) / 2 / MS_PER_MIN) * MS_PER_MIN;
        if (mid === lo) break;
        if (clock.offsetMinutesAt(mid) === offset) lo = mid;
        else hi = mid;
      }
      out.push({ atMs: hi, fromMinutes: offset, toMinutes: nextOffset });
    }
    t = next;
    offset = nextOffset;
  }
  return out;
}

/**
 * VTIMEZONE for `tzid` covering [fromMs, toMs], derived from the clock (so it is correct for whatever
 * tz rules the device's Intl data has, e.g. Egypt's 2023 DST reintroduction).
 *
 * Each observed transition becomes its own STANDARD/DAYLIGHT sub-component with an explicit DTSTART
 * (no RRULE), which is valid RFC 5545 and avoids encoding Egypt's "last Thursday of October at 24:00"
 * rule, which RRULE cannot express cleanly. A base component at 1970 gives the offset before the first
 * transition. DTSTART is the local time in the offset *before* the transition (RFC 5545 §3.6.5).
 */
export function buildVTimezone(tzid: string, clock: ZonedClock, fromMs: number, toMs: number): string[] {
  const transitions = findTransitions(clock, fromMs, toMs);
  const initial = clock.offsetMinutesAt(fromMs);
  const all = [initial, ...transitions.map((t) => t.toMinutes)];
  const standard = Math.min(...all);
  const kind = (offset: number): string => (offset > standard ? 'DAYLIGHT' : 'STANDARD');

  const lines = ['BEGIN:VTIMEZONE', `TZID:${tzid}`];
  const component = (offsetFrom: number, offsetTo: number, dtstart: string): void => {
    const k = kind(offsetTo);
    lines.push(
      `BEGIN:${k}`,
      `DTSTART:${dtstart}`,
      `TZOFFSETFROM:${formatOffset(offsetFrom)}`,
      `TZOFFSETTO:${formatOffset(offsetTo)}`,
      `END:${k}`,
    );
  };
  component(initial, initial, '19700101T000000');
  for (const t of transitions) {
    const wall = wallMsToLocal(t.atMs + t.fromMinutes * MS_PER_MIN);
    component(t.fromMinutes, t.toMinutes, formatLocal(wall));
  }
  lines.push('END:VTIMEZONE');
  return lines;
}
