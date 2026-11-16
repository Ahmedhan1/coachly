import { daysBetween, type Client, type ClientAttention, type IsoDate, type Session } from '@/domain/models';

export type AgendaStatus = 'upcoming' | 'past' | 'attended' | 'missed';

export interface AgendaItem {
  session: Session;
  client: Client;
  status: AgendaStatus;
}

export interface NextSession extends AgendaItem {
  /** Minutes until start; ≤ 0 means it is running now. */
  minutesUntil: number;
  /** "Session n of total" within the client's package, when there is one. */
  packageIndex: { n: number; total: number } | null;
}

const MINUTE = 60_000;

function statusOf(session: Session, now: number): AgendaStatus {
  if (session.attendance === 'attended') return 'attended';
  if (session.attendance === 'missed') return 'missed';
  return session.startsAt + session.durationMin * MINUTE <= now ? 'past' : 'upcoming';
}

export function packageIndex(client: Client): { n: number; total: number } | null {
  const pkg = client.package;
  if (!pkg || pkg.totalSessions <= 0) return null;
  const n = Math.min(pkg.totalSessions, Math.max(1, pkg.totalSessions - client.remainingSessions + 1));
  return { n, total: pkg.totalSessions };
}

/**
 * Splits today's sessions for Home: the next (or running) session for the hero, then the rest of the day —
 * later sessions first (soonest first), then finished ones (latest first). Cancelled sessions are dropped.
 */
export function planToday(items: ReadonlyArray<{ session: Session; client: Client }>, now: number) {
  const agenda = items
    .filter(({ session }) => session.attendance !== 'cancelled')
    .map(({ session, client }) => ({ session, client, status: statusOf(session, now) }))
    .sort((a, b) => a.session.startsAt - b.session.startsAt);
  const upcoming = agenda.filter((a) => a.status === 'upcoming');
  const finished = agenda.filter((a) => a.status !== 'upcoming').reverse();
  const first = upcoming[0];
  const next: NextSession | null = first
    ? { ...first, minutesUntil: Math.round((first.session.startsAt - now) / MINUTE), packageIndex: packageIndex(first.client) }
    : null;
  return { next, rest: [...upcoming.slice(1), ...finished], total: agenda.length, done: finished.length };
}

/** Days since the last weigh-in, or null if the client never logged one. */
export function daysSinceCheckIn(lastCheckIn: IsoDate | null, today: IsoDate): number | null {
  return lastCheckIn === null ? null : daysBetween(lastCheckIn, today);
}

/** Sort order for "ending soon": the most urgent first. */
export function attentionRank(a: ClientAttention): number {
  switch (a.kind) {
    case 'ended':
      return -1000 + a.daysAgo * -1;
    case 'ending_soon':
      return a.daysLeft;
    case 'low_sessions':
      return 100 + a.remaining;
  }
}
