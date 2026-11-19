import type { IsoDate } from '../models/common';
import { daysBetween } from '../models/dates';
import { packageBalance } from '../finance/packageBalance';
import { splitClientSessions, type SessionLike } from './sessions';

export interface OverviewInput<S extends SessionLike> {
  client: { package: { totalSessions: number; priceMinor?: number } | null; remainingSessions: number; startDate?: IsoDate | null };
  sessions: readonly S[];
  payments: ReadonlyArray<{ status: 'paid' | 'due'; amountMinor: number; dueOn: IsoDate | null; paidOn: IsoDate | null }>;
  lastCheckIn: IsoDate | null;
  now: number;
  today: IsoDate;
}

/** The facts on top of a client's hub: package, next/last session, money owed, last check-in. */
export function clientOverview<S extends SessionLike>(input: OverviewInput<S>) {
  const { upcoming, past } = splitClientSessions(input.sessions, input.now);
  const pkg = input.client.package;
  const due = input.payments.filter((p) => p.status === 'due');
  const left = Math.max(0, input.client.remainingSessions);
  const balance = packageBalance(pkg ? { priceMinor: pkg.priceMinor ?? 0, startDate: input.client.startDate ?? null } : null, input.payments);
  return {
    sessionsLeft: pkg && pkg.totalSessions > 0 ? { left, total: pkg.totalSessions, used: Math.max(0, pkg.totalSessions - left) } : null,
    next: upcoming[0] ?? null,
    upcomingCount: upcoming.length,
    lastAttended: past.find((s) => s.attendance === 'attended') ?? null,
    owedMinor: balance.owedMinor,
    /** Paid so far toward the current package's price; null without a priced, dated package. */
    packagePaid: balance.priceMinor > 0 ? { paidMinor: balance.paidMinor, priceMinor: balance.priceMinor } : null,
    overdueMinor: due.filter((p) => p.dueOn !== null && p.dueOn <= input.today).reduce((n, p) => n + p.amountMinor, 0),
    checkInDaysAgo: input.lastCheckIn === null ? null : daysBetween(input.lastCheckIn, input.today),
  };
}

export type ClientOverview = ReturnType<typeof clientOverview>;
