import type { ActionArgs, ActionToolName } from './tools';

/**
 * Turns a validated action call into a concrete proposal the trainer can read and confirm.
 * Nothing here writes; the feature layer runs a proposal only after the trainer taps "نفّذ".
 */

export interface ClientRef {
  id: string;
  name: string;
  notes: string;
}
export interface SessionRef {
  id: string;
  clientId: string;
  startsAt: number;
  durationMin: number;
}

export interface PlanContext {
  clients: readonly ClientRef[];
  sessions: readonly SessionRef[];
  currency: string;
  /** Local date of "now", YYYY-MM-DD. */
  today: string;
  /** Local date + HH:MM → epoch ms (device zone). */
  toEpoch: (date: string, time: string) => number;
  /** Epoch ms of "now" (time is always passed in). */
  now: number;
}

export type ProposedAction =
  | { type: 'add_client'; name: string; phone: string; goal: ActionArgs<'add_client'>['goal']; sessions: number | null }
  | { type: 'book_session'; clientId: string; clientName: string; startsAt: number; durationMin: number }
  | { type: 'move_session'; sessionId: string; clientId: string; clientName: string; from: number; to: number }
  | { type: 'record_payment'; clientId: string; clientName: string; amountMinor: number; currency: string; method: 'cash' | 'instapay' | 'wallet' | 'bank' | 'other'; status: 'paid' | 'due'; date: string }
  | { type: 'create_task'; title: string; due: string | null; clientId: string | null; clientName: string | null }
  | { type: 'draft_whatsapp'; clientId: string; clientName: string; text: string }
  | { type: 'create_program_draft'; clientId: string; clientName: string; daysPerWeek: number; notes: string }
  | { type: 'create_meal_plan_draft'; clientId: string; clientName: string; notes: string }
  | { type: 'add_recipe'; recipe: ActionArgs<'add_recipe'> }
  | { type: 'update_client_note'; clientId: string; clientName: string; before: string; after: string; mode: 'append' | 'replace' };

export type PlanError = 'unknown_client' | 'ambiguous_client' | 'unknown_session' | 'in_past';

type Plan = { ok: true; value: ProposedAction } | { ok: false; error: PlanError };

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

/** Finds a client by id, else by exact name, else by a unique partial name. */
export function resolveClient(ref: string, clients: readonly ClientRef[]): { ok: true; value: ClientRef } | { ok: false; error: 'unknown_client' | 'ambiguous_client' } {
  const byId = clients.find((c) => c.id === ref);
  if (byId) return { ok: true, value: byId };
  const q = normalize(ref);
  if (!q) return { ok: false, error: 'unknown_client' };
  const exact = clients.filter((c) => normalize(c.name) === q);
  if (exact.length === 1 && exact[0]) return { ok: true, value: exact[0] };
  const partial = clients.filter((c) => normalize(c.name).includes(q));
  if (partial.length === 1 && partial[0]) return { ok: true, value: partial[0] };
  return { ok: false, error: partial.length > 1 || exact.length > 1 ? 'ambiguous_client' : 'unknown_client' };
}

const DAY_MS = 86_400_000;

export function planAction<N extends ActionToolName>(name: N, args: ActionArgs<N>, ctx: PlanContext): Plan {
  const a = args as ActionArgs<ActionToolName>;
  const client = (ref: string) => resolveClient(ref, ctx.clients);
  switch (name) {
    case 'add_client': {
      const x = a as ActionArgs<'add_client'>;
      return { ok: true, value: { type: 'add_client', name: x.name, phone: x.phone.replace(/[^0-9+\s-]/g, ''), goal: x.goal ?? null, sessions: x.sessions ?? null } };
    }
    case 'book_session': {
      const x = a as ActionArgs<'book_session'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      const startsAt = ctx.toEpoch(x.date, x.time);
      if (startsAt < ctx.now - DAY_MS) return { ok: false, error: 'in_past' };
      return { ok: true, value: { type: 'book_session', clientId: c.value.id, clientName: c.value.name, startsAt, durationMin: x.durationMin ?? 60 } };
    }
    case 'move_session': {
      const x = a as ActionArgs<'move_session'>;
      const s = ctx.sessions.find((r) => r.id === x.sessionId);
      if (!s) return { ok: false, error: 'unknown_session' };
      const c = ctx.clients.find((r) => r.id === s.clientId);
      return { ok: true, value: { type: 'move_session', sessionId: s.id, clientId: s.clientId, clientName: c?.name ?? '', from: s.startsAt, to: ctx.toEpoch(x.date, x.time) } };
    }
    case 'record_payment': {
      const x = a as ActionArgs<'record_payment'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      return {
        ok: true,
        value: {
          type: 'record_payment',
          clientId: c.value.id,
          clientName: c.value.name,
          amountMinor: Math.round(x.amount * 100),
          currency: ctx.currency,
          method: x.method ?? 'cash',
          status: x.status ?? 'paid',
          date: x.date ?? ctx.today,
        },
      };
    }
    case 'create_task': {
      const x = a as ActionArgs<'create_task'>;
      let clientId: string | null = null;
      let clientName: string | null = null;
      if (x.clientId) {
        const c = client(x.clientId);
        if (c.ok) {
          clientId = c.value.id;
          clientName = c.value.name;
        }
      }
      return { ok: true, value: { type: 'create_task', title: x.title, due: x.due ?? null, clientId, clientName } };
    }
    case 'draft_whatsapp': {
      const x = a as ActionArgs<'draft_whatsapp'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      return { ok: true, value: { type: 'draft_whatsapp', clientId: c.value.id, clientName: c.value.name, text: x.text } };
    }
    case 'create_program_draft': {
      const x = a as ActionArgs<'create_program_draft'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      return { ok: true, value: { type: 'create_program_draft', clientId: c.value.id, clientName: c.value.name, daysPerWeek: x.daysPerWeek, notes: x.notes } };
    }
    case 'create_meal_plan_draft': {
      const x = a as ActionArgs<'create_meal_plan_draft'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      return { ok: true, value: { type: 'create_meal_plan_draft', clientId: c.value.id, clientName: c.value.name, notes: x.notes } };
    }
    case 'add_recipe':
      return { ok: true, value: { type: 'add_recipe', recipe: a as ActionArgs<'add_recipe'> } };
    case 'update_client_note': {
      const x = a as ActionArgs<'update_client_note'>;
      const c = client(x.clientId);
      if (!c.ok) return c;
      const before = c.value.notes;
      const after = (x.mode === 'replace' || !before.trim() ? x.note : `${before.trimEnd()}\n${x.note}`).slice(0, 5000);
      return { ok: true, value: { type: 'update_client_note', clientId: c.value.id, clientName: c.value.name, before, after, mode: x.mode } };
    }
    default:
      return { ok: false, error: 'unknown_client' };
  }
}
