import { addDays, type IsoDate, type ZonedClock } from '../schedule';

/** Server limits (docs/CLOUD.md §2): ≤ 100 items, from now to now + 40 days, title ≤ 120, body ≤ 120. */
export const PUSH_MAX_ITEMS = 100;
export const PUSH_HORIZON_MS = 40 * 86_400_000;

export interface PushItem {
  id: string;
  /** unix seconds */
  at: number;
  title: string;
  body: string;
}

export interface PushTexts {
  /** Generic text only: never a client name (the server stores it in plain form). */
  session(leadMinutes: number): { title: string; body: string };
  renewal(daysBefore: number): { title: string; body: string };
}

export interface PushScheduleInput {
  now: number;
  clock: ZonedClock;
  leadMinutes: number;
  renewalDaysBefore: number;
  /** Local time of day for renewal reminders, minutes after midnight. */
  renewalMinuteOfDay: number;
  sessions: ReadonlyArray<{ id: string; startsAt: number; attendance: string }>;
  subscriptions: ReadonlyArray<{ id: string; endDate: IsoDate }>;
  texts: PushTexts;
}

const safeId = (prefix: string, id: string) => `${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64);
const clip = (s: string) => s.slice(0, 120);

/** The whole device schedule sent to PUT /api/push/schedule (it replaces the previous one). */
export function buildPushSchedule(input: PushScheduleInput): PushItem[] {
  const until = input.now + PUSH_HORIZON_MS;
  const out: PushItem[] = [];
  const sessionText = input.texts.session(input.leadMinutes);
  for (const s of input.sessions) {
    if (s.attendance !== 'scheduled') continue;
    const at = s.startsAt - input.leadMinutes * 60_000;
    if (at <= input.now || at > until) continue;
    out.push({ id: safeId('ses', s.id), at: Math.floor(at / 1000), title: clip(sessionText.title), body: clip(sessionText.body) });
  }
  const renewalText = input.texts.renewal(input.renewalDaysBefore);
  for (const sub of input.subscriptions) {
    const at = input.clock.toEpochMs({ date: addDays(sub.endDate, -input.renewalDaysBefore), minute: input.renewalMinuteOfDay });
    if (at <= input.now || at > until) continue;
    out.push({ id: safeId('sub', sub.id), at: Math.floor(at / 1000), title: clip(renewalText.title), body: clip(renewalText.body) });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, PUSH_MAX_ITEMS);
}
