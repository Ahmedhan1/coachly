/**
 * What clients did on their pages (check-in with a question or measurements, a photo), kept on the phone so the
 * trainer sees who sent what and when, instead of a toast that disappears after a few seconds.
 */
export type ActivityKind = 'checkin' | 'photo';

export interface ActivityEvent {
  /** Stable id (the check-in id, or photo + image id) so a repeated pull never adds the same event twice. */
  id: string;
  kind: ActivityKind;
  clientId: string;
  /** Unix ms: when the client sent it. */
  at: number;
  /** The client's own words (start of the check-in note), if any. */
  note?: string;
  seen: boolean;
}

export const ACTIVITY_MAX = 50;
export const ACTIVITY_NOTE_MAX = 140;

const KINDS: readonly string[] = ['checkin', 'photo'];

function clean(e: ActivityEvent): ActivityEvent {
  const out: ActivityEvent = { id: e.id, kind: e.kind, clientId: e.clientId, at: e.at, seen: e.seen };
  const note = e.note?.trim();
  if (note) out.note = note.slice(0, ACTIVITY_NOTE_MAX);
  return out;
}

const newestFirst = (a: ActivityEvent, b: ActivityEvent) => b.at - a.at;

export function addActivity(list: readonly ActivityEvent[], added: readonly ActivityEvent[]): ActivityEvent[] {
  const ids = new Set(list.map((e) => e.id));
  const fresh: ActivityEvent[] = [];
  for (const e of added) {
    if (ids.has(e.id)) continue;
    ids.add(e.id);
    fresh.push(clean(e));
  }
  return [...list, ...fresh].sort(newestFirst).slice(0, ACTIVITY_MAX);
}

export function markActivitySeen(list: readonly ActivityEvent[], which: readonly string[] | 'all' | { clientId: string }): ActivityEvent[] {
  const hit = (e: ActivityEvent) => (which === 'all' ? true : Array.isArray(which) ? which.includes(e.id) : e.clientId === (which as { clientId: string }).clientId);
  return list.map((e) => (!e.seen && hit(e) ? { ...e, seen: true } : e));
}

export function unseenActivity(list: readonly ActivityEvent[]): ActivityEvent[] {
  return list.filter((e) => !e.seen);
}

export function parseActivity(raw: unknown): ActivityEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ActivityEvent[] = [];
  for (const v of raw as unknown[]) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || typeof r.clientId !== 'string' || typeof r.kind !== 'string' || !KINDS.includes(r.kind)) continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at) || typeof r.seen !== 'boolean') continue;
    const e: ActivityEvent = { id: r.id, kind: r.kind as ActivityKind, clientId: r.clientId, at: r.at, seen: r.seen };
    if (typeof r.note === 'string') e.note = r.note;
    out.push(clean(e));
  }
  return out.sort(newestFirst).slice(0, ACTIVITY_MAX);
}
