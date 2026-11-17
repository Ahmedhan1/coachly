import type { IsoDate } from '../models/common';
import { daysBetween } from '../models/dates';

/** Why Home asks the trainer to look at a client (package endings have their own list with «جدّد»). */
export type FollowUpReason =
  | { kind: 'overdue_payment'; amountMinor: number; daysLate: number }
  | { kind: 'no_session_week' }
  | { kind: 'missed_checkin'; days: number | null };

export interface FollowUpClient {
  id: string;
  package: { totalSessions: number } | null;
  remainingSessions: number;
  endDate: IsoDate | null;
}

export interface FollowUpInput {
  clients: readonly FollowUpClient[];
  duePayments: ReadonlyArray<{ clientId: string; amountMinor: number; dueOn: IsoDate | null; status: 'paid' | 'due' }>;
  lastCheckIns: ReadonlyMap<string, IsoDate>;
  /** Clients with a (not cancelled) session booked in the current week. */
  bookedThisWeek: ReadonlySet<string>;
  today: IsoDate;
  checkInAfterDays?: number;
}

export interface FollowUp {
  clientId: string;
  reasons: FollowUpReason[];
}

/** Still training with the trainer: sessions left and the period not over (no package: until an end date). */
export function isActiveClient(c: FollowUpClient, today: IsoDate): boolean {
  if (c.endDate !== null && c.endDate < today) return false;
  return c.package === null || c.package.totalSessions <= 0 || c.remainingSessions > 0;
}

const rank = (r: FollowUpReason) => (r.kind === 'overdue_payment' ? 0 : r.kind === 'no_session_week' ? 1 : 2);

export function followUps(input: FollowUpInput): FollowUp[] {
  const afterDays = input.checkInAfterDays ?? 14;
  const overdue = new Map<string, { amountMinor: number; daysLate: number }>();
  for (const p of input.duePayments) {
    if (p.status !== 'due' || p.dueOn === null || p.dueOn > input.today) continue;
    const cur = overdue.get(p.clientId) ?? { amountMinor: 0, daysLate: 0 };
    overdue.set(p.clientId, { amountMinor: cur.amountMinor + p.amountMinor, daysLate: Math.max(cur.daysLate, daysBetween(p.dueOn, input.today)) });
  }
  const out: Array<FollowUp & { sortKey: number }> = [];
  for (const c of input.clients) {
    const reasons: FollowUpReason[] = [];
    const owed = overdue.get(c.id);
    if (owed) reasons.push({ kind: 'overdue_payment', ...owed });
    if (isActiveClient(c, input.today)) {
      if (!input.bookedThisWeek.has(c.id)) reasons.push({ kind: 'no_session_week' });
      const last = input.lastCheckIns.get(c.id) ?? null;
      const days = last === null ? null : daysBetween(last, input.today);
      if (days === null || days > afterDays) reasons.push({ kind: 'missed_checkin', days });
    }
    const first = reasons[0];
    if (!first) continue;
    out.push({ clientId: c.id, reasons, sortKey: rank(first) * 100_000 - (owed?.daysLate ?? 0) });
  }
  return out.sort((a, b) => a.sortKey - b.sortKey).map(({ clientId, reasons }) => ({ clientId, reasons }));
}
