import { z } from 'zod';
import type { Client, ClientGoal, IsoDate, Session } from '@/domain/models';
import { subscriptionAttention } from '@/domain/models';

/**
 * Gym teams (pure rules). A trainer in a gym shares a small summary of their clients with the gym manager:
 * names, package, sessions left, dates, last attended session. Never phones, notes, measurements or photos.
 * The app seals it with the gym's team key before it leaves the phone (src/services/team).
 */
export const ROSTER_VERSION = 1;

const attentionSchema = z.enum(['ending_soon', 'ended', 'low_sessions']).nullable();

const rosterClientSchema = z.object({
  name: z.string().max(200),
  goal: z.string().max(40),
  packageName: z.string().max(200).nullable(),
  totalSessions: z.number().int().min(0).max(1000),
  remainingSessions: z.number().int().min(0).max(1000),
  startDate: z.string().max(10).nullable(),
  endDate: z.string().max(10).nullable(),
  lastSessionAt: z.number().int().nullable(),
  attention: attentionSchema,
});

const rosterSchema = z.object({
  v: z.literal(ROSTER_VERSION),
  trainerName: z.string().max(200),
  generatedAt: z.number().int(),
  clients: z.array(rosterClientSchema).max(5000),
});

export type RosterClient = z.infer<typeof rosterClientSchema>;
export type Roster = z.infer<typeof rosterSchema>;

export interface RosterInput {
  trainerName: string;
  clients: ReadonlyArray<Pick<Client, 'id' | 'name' | 'goal' | 'package' | 'remainingSessions' | 'startDate' | 'endDate'>>;
  sessions: ReadonlyArray<Pick<Session, 'clientId' | 'startsAt' | 'attendance'>>;
  today: IsoDate;
  now: Date;
}

export function buildRoster(input: RosterInput): Roster {
  const lastAttended = new Map<string, number>();
  for (const s of input.sessions) {
    if (s.attendance !== 'attended' || s.startsAt > input.now.getTime()) continue;
    lastAttended.set(s.clientId, Math.max(lastAttended.get(s.clientId) ?? 0, s.startsAt));
  }
  return {
    v: ROSTER_VERSION,
    trainerName: input.trainerName,
    generatedAt: input.now.getTime(),
    clients: input.clients.map((c) => ({
      name: c.name,
      goal: c.goal satisfies ClientGoal,
      packageName: c.package?.name ?? null,
      totalSessions: c.package?.totalSessions ?? 0,
      remainingSessions: c.remainingSessions,
      startDate: c.startDate,
      endDate: c.endDate,
      lastSessionAt: lastAttended.get(c.id) ?? null,
      attention: subscriptionAttention(c, input.today)?.kind ?? null,
    })),
  };
}

export function parseRoster(value: unknown): Roster | null {
  const parsed = rosterSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function teamTotals(rosters: readonly Roster[]): { trainers: number; clients: number; needAttention: number } {
  let clients = 0;
  let needAttention = 0;
  for (const r of rosters) {
    clients += r.clients.length;
    needAttention += r.clients.filter((c) => c.attention !== null).length;
  }
  return { trainers: rosters.length, clients, needAttention };
}

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** `<app>/#join=<invite code>.<team key>`: both parts in the fragment, which browsers never send to a server. */
export function inviteLink(appOrigin: string, code: string, key: string): string {
  return `${appOrigin}/#join=${code}.${key}`;
}

export function readJoinFragment(hash: string): { code: string; key: string } | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('join');
  if (value === null) return null;
  const [code, key, extra] = value.split('.');
  if (code === undefined || key === undefined || extra !== undefined || !TOKEN.test(code) || !TOKEN.test(key)) return null;
  return { code, key };
}
