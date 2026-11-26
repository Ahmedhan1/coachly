import { DEFAULT_TIME_ZONE, intlZonedClock, type ZonedClock } from '@/domain/schedule';

let cached: { timeZone: string; clock: ZonedClock } | null = null;

/** The device's time zone (Africa/Cairo when unknown) and its clock, for wall-time ⇄ instant. */
export function deviceZone(): { timeZone: string; clock: ZonedClock } {
  if (cached) return cached;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  const clock = intlZonedClock(resolved);
  if (clock.ok) {
    cached = { timeZone: resolved, clock: clock.value };
    return cached;
  }
  const fallback = intlZonedClock(DEFAULT_TIME_ZONE);
  if (!fallback.ok) throw new Error('Intl time zones unavailable');
  cached = { timeZone: DEFAULT_TIME_ZONE, clock: fallback.value };
  return cached;
}
