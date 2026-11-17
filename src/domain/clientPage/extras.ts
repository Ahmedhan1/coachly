import type { Measurements, Program, ProgressEntry, Session, WorkoutLog } from '../models';
import type { ShareExtras, ShareSeriesKey } from './document';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Series key on the client page → measurement field. Order = order of the cards. */
export const SERIES_FIELDS: ReadonlyArray<readonly [ShareSeriesKey, keyof Measurements]> = [
  ['weight', 'weightKg'],
  ['waist', 'waistCm'],
  ['bodyFat', 'bodyFatPercent'],
  ['hip', 'hipCm'],
  ['chest', 'chestCm'],
  ['arm', 'armCm'],
  ['thigh', 'thighCm'],
];

export const EXTRA_LIMITS = { seriesPoints: 60, sessions: 5, checkins: 12 } as const;

export interface ExtrasInput {
  now: number;
  progress: readonly ProgressEntry[];
  sessions: readonly Session[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weeks in a row (7-day windows ending now) with at least one attended session; the current window may still be empty. */
export function attendanceStreakWeeks(sessions: readonly Session[], now: number): number {
  const weeks = new Set<number>();
  for (const s of sessions) {
    if (s.deletedAt !== null || s.attendance !== 'attended' || s.startsAt > now) continue;
    weeks.add(Math.floor((now - s.startsAt) / WEEK_MS));
  }
  let k = weeks.has(0) ? 0 : 1;
  let streak = 0;
  while (weeks.has(k)) {
    streak++;
    k++;
  }
  return streak;
}

/** Index of the program day after the last one logged for this program (0 when nothing is logged). */
export function nextProgramDay(program: Pick<Program, 'id' | 'days'>, logs: readonly WorkoutLog[]): number {
  const mine = logs.filter((l) => l.deletedAt === null && l.programId === program.id && l.programDayId !== null);
  if (mine.length === 0 || program.days.length === 0) return 0;
  const last = mine.reduce((a, b) => (b.date > a.date ? b : a));
  const i = program.days.findIndex((d) => d.id === last.programDayId);
  return i < 0 ? 0 : (i + 1) % program.days.length;
}

/**
 * The progress dashboard part of the client page: measurement series, upcoming sessions, attendance and
 * streak, and the client's own check-in history. Pure; `now` is passed in.
 */
export function shareExtras(x: ExtrasInput): Pick<ShareExtras, 'progress' | 'sessions' | 'attended' | 'streakWeeks' | 'checkins' | 'startDate'> {
  const entries = x.progress.filter((e) => e.deletedAt === null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const progress = SERIES_FIELDS.flatMap(([key, field]) => {
    const points = entries.flatMap((e) => {
      const v = e.measurements[field];
      return v === undefined || !(v >= 0 && v <= 1000) ? [] : [{ d: e.date, v: round1(v) }];
    });
    return points.length > 0 ? [{ key, points: points.slice(-EXTRA_LIMITS.seriesPoints) }] : [];
  });
  const live = x.sessions.filter((s) => s.deletedAt === null);
  const sessions = live
    .filter((s) => s.attendance === 'scheduled' && s.startsAt + s.durationMin * 60_000 > x.now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, EXTRA_LIMITS.sessions)
    .map((s) => ({ at: Math.floor(s.startsAt / 1000), durationMin: s.durationMin }));
  const checkins = entries
    .filter((e) => e.source === 'client')
    .reverse()
    .slice(0, EXTRA_LIMITS.checkins)
    .map((e) => {
      const c: NonNullable<ShareExtras['checkins']>[number] = { d: e.date };
      if (e.measurements.weightKg !== undefined) c.weightKg = round1(e.measurements.weightKg);
      if (e.measurements.waistCm !== undefined) c.waistCm = round1(e.measurements.waistCm);
      return c;
    });
  const out: ReturnType<typeof shareExtras> = {
    progress,
    sessions,
    attended: Math.min(100_000, live.filter((s) => s.attendance === 'attended').length),
    streakWeeks: Math.min(520, attendanceStreakWeeks(live, x.now)),
    checkins,
  };
  if (entries[0]) out.startDate = entries[0].date;
  return out;
}

/** Heaviest completed set per exercise (newest records first, at most `max`), for "أحسن أرقامك". */
export function bestLifts(logs: readonly WorkoutLog[], name: (exerciseId: string) => string, max = 6): NonNullable<ShareExtras['records']> {
  const best = new Map<string, { weightKg: number; reps: number; d: string }>();
  for (const log of logs) {
    if (log.deletedAt !== null) continue;
    for (const ex of log.exercises) {
      for (const set of ex.sets) {
        if (!set.done || set.weightKg <= 0 || set.reps <= 0) continue;
        const cur = best.get(ex.exerciseId);
        if (!cur || set.weightKg > cur.weightKg || (set.weightKg === cur.weightKg && set.reps > cur.reps)) {
          best.set(ex.exerciseId, { weightKg: set.weightKg, reps: set.reps, d: log.date });
        }
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => (a[1].d < b[1].d ? 1 : a[1].d > b[1].d ? -1 : 0))
    .slice(0, max)
    .map(([id, r]) => ({ name: name(id), ...r }));
}
