import { addDays, toDayNumber, type IsoDate } from '../schedule';

/**
 * The trainer's daily "messages to send" list: a free automation (no WhatsApp API). Each item becomes a
 * one-tap wa.me link with the trainer's template. Ids are stable per client and occasion, so a message
 * marked as sent never comes back for the same occasion.
 */
export type OutboxKind = 'session_reminder' | 'renewal' | 'payment_due' | 'checkin_reminder' | 'birthday' | 'welcome' | 'missed_session';

export const OUTBOX_KINDS: readonly OutboxKind[] = ['session_reminder', 'renewal', 'payment_due', 'missed_session', 'checkin_reminder', 'birthday', 'welcome'];

export interface OutboxClient {
  id: string;
  name: string;
  phone: string;
  birthDate: string | null;
  endDate: string | null;
  remainingSessions: number;
  hasPackage: boolean;
  /** Local date the client was added. */
  createdOn: IsoDate;
  /** Sample data from the first run: never welcomed. */
  isDemo?: boolean;
}

export interface OutboxInput {
  today: IsoDate;
  /** Local date of an instant (from the device zone). */
  dateOf: (epochMs: number) => IsoDate;
  clients: readonly OutboxClient[];
  sessions: ReadonlyArray<{ id: string; clientId: string; startsAt: number; attendance: string }>;
  payments: ReadonlyArray<{ id: string; clientId: string; status: 'paid' | 'due'; dueOn: string | null; amountMinor: number }>;
  /** Last check-in (progress entry) date per client. */
  lastCheckIn: ReadonlyMap<string, IsoDate>;
  sent: ReadonlySet<string>;
  /** Which kinds the trainer wants (all by default). */
  enabled?: ReadonlySet<OutboxKind>;
  renewalDays?: number;
  checkinEveryDays?: number;
}

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  clientId: string;
  /** Extra values for the template: session time, amount, days left. */
  startsAt?: number;
  amountMinor?: number;
  daysLeft?: number;
  /** Set when the renewal is due because the package's sessions ran out (not the date). */
  sessionsLeft?: number;
}

const ORDER: Record<OutboxKind, number> = { session_reminder: 0, payment_due: 1, renewal: 2, missed_session: 3, checkin_reminder: 4, birthday: 5, welcome: 6 };

export function buildOutbox(input: OutboxInput): OutboxItem[] {
  const on = (k: OutboxKind) => !input.enabled || input.enabled.has(k);
  const out: OutboxItem[] = [];
  const push = (item: OutboxItem) => {
    if (!input.sent.has(item.id)) out.push(item);
  };
  const byId = new Map(input.clients.map((c) => [c.id, c]));
  const tomorrow = addDays(input.today, 1);
  const yesterday = addDays(input.today, -1);
  const today = toDayNumber(input.today);

  for (const s of input.sessions) {
    if (!byId.has(s.clientId)) continue;
    const day = input.dateOf(s.startsAt);
    if (on('session_reminder') && s.attendance === 'scheduled' && day === tomorrow) push({ id: `session_reminder:${s.id}`, kind: 'session_reminder', clientId: s.clientId, startsAt: s.startsAt });
    if (on('missed_session') && s.attendance === 'missed' && (day === yesterday || day === input.today)) push({ id: `missed_session:${s.id}`, kind: 'missed_session', clientId: s.clientId, startsAt: s.startsAt });
  }

  if (on('payment_due')) {
    const dueByClient = new Map<string, { amount: number; oldest: string; ids: string[] }>();
    for (const p of input.payments) {
      if (p.status !== 'due' || !p.dueOn || p.dueOn > input.today || !byId.has(p.clientId)) continue;
      const prev = dueByClient.get(p.clientId) ?? { amount: 0, oldest: p.dueOn, ids: [] };
      dueByClient.set(p.clientId, { amount: prev.amount + p.amountMinor, oldest: p.dueOn < prev.oldest ? p.dueOn : prev.oldest, ids: [...prev.ids, p.id] });
    }
    // One reminder per client per week while it stays unpaid.
    for (const [clientId, d] of dueByClient) push({ id: `payment_due:${clientId}:${Math.floor(today / 7)}`, kind: 'payment_due', clientId, amountMinor: d.amount });
  }

  for (const c of input.clients) {
    if (!c.phone.trim()) continue;
    if (on('renewal') && c.hasPackage && c.endDate) {
      const left = toDayNumber(c.endDate) - today;
      const lowSessions = c.remainingSessions <= 1;
      const byDate = left >= 0 && left <= (input.renewalDays ?? 3);
      if (byDate) push({ id: `renewal:${c.id}:${c.endDate}`, kind: 'renewal', clientId: c.id, daysLeft: left });
      else if (lowSessions && left >= 0) push({ id: `renewal:${c.id}:${c.endDate}`, kind: 'renewal', clientId: c.id, sessionsLeft: Math.max(0, c.remainingSessions) });
    }
    if (on('birthday') && c.birthDate && c.birthDate.slice(5) === input.today.slice(5)) push({ id: `birthday:${c.id}:${input.today.slice(0, 4)}`, kind: 'birthday', clientId: c.id });
    if (on('welcome') && !c.isDemo && toDayNumber(input.today) - toDayNumber(c.createdOn) <= 2) push({ id: `welcome:${c.id}`, kind: 'welcome', clientId: c.id });
    if (on('checkin_reminder') && c.hasPackage && (c.endDate === null || c.endDate >= input.today)) {
      const every = input.checkinEveryDays ?? 7;
      const last = input.lastCheckIn.get(c.id);
      const since = last ? today - toDayNumber(last) : today - toDayNumber(c.createdOn);
      if (since >= every) push({ id: `checkin_reminder:${c.id}:${Math.floor(today / every)}`, kind: 'checkin_reminder', clientId: c.id });
    }
  }
  return out.filter((i) => byId.get(i.clientId)?.phone.trim()).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.startsAt ?? 0) - (b.startsAt ?? 0));
}
