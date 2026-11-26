import type { Repositories } from '@/data';
import {
  planOccurrences,
  recurrenceRuleOf,
  remainingAfterChange,
  statusOf,
  storedAttendanceFor,
  type BookingInput,
  type MarkStatus,
  type PlannedOccurrence,
} from '@/domain/attendance';
import { addDays, type Client, type ClientId, type ProgramId, type Session } from '@/domain/models';
import type { AttendanceStatus, RecurrenceError, ZonedClock } from '@/domain/schedule';
import { ok, type Result } from '@/domain/nutrition/result';
import type { MetaStore } from '@/services/meta/metaStore';
import { consumingStatuses, LATE_CANCEL_KEY, parseIdList, readPrefs, setLateCancel } from './prefs';

/**
 * Every schedule write (book, edit, delete, attendance) in one place, over the repositories and the meta
 * store. Each returns an `undo` so the screen can offer it in a toast.
 */
export interface ScheduleWriterDeps {
  repos: Repositories;
  meta: MetaStore;
  clock: ZonedClock;
}

export interface BookingRequest extends BookingInput {
  clientId: ClientId;
  notes: string;
  /** The client's program the session is for (left as it is when undefined). */
  programId?: ProgramId | null;
}

export type Undo = () => Promise<void>;

const byStart = (a: Session, b: Session) => a.startsAt - b.startsAt;

const editableFields = (s: Session) => ({
  clientId: s.clientId,
  startsAt: s.startsAt,
  durationMin: s.durationMin,
  recurrence: s.recurrence,
  seriesId: s.seriesId,
  attendance: s.attendance,
  programId: s.programId,
  notes: s.notes,
});

async function lateCancelIds(meta: MetaStore): Promise<Set<string>> {
  return new Set(parseIdList(await meta.get(LATE_CANCEL_KEY)));
}

/** Adjusts the client's remaining sessions for status changes of their sessions. */
async function applyUsage(
  repos: Repositories,
  clientId: string,
  changes: ReadonlyArray<{ before: ReturnType<typeof statusOf>; after: ReturnType<typeof statusOf> }>,
  consuming?: readonly AttendanceStatus[],
) {
  const client = await repos.clients.get(clientId);
  if (!client?.package) return;
  let stored = client.remainingSessions;
  for (const c of changes) stored = remainingAfterChange({ stored, before: c.before, after: c.after, consuming });
  if (stored !== client.remainingSessions) await repos.clients.update(client.id, { remainingSessions: stored });
}

/** Future, still-scheduled occurrences of a series from `from` on (the ones a series edit may change). */
export async function futureOfSeries(repos: Repositories, session: Session): Promise<Session[]> {
  if (!session.seriesId) return [session];
  const all = await repos.sessions.listByClient(session.clientId);
  return all
    .filter((s) => s.seriesId === session.seriesId && s.startsAt >= session.startsAt && (s.attendance === 'scheduled' || s.id === session.id))
    .sort(byStart);
}

/** Rewrites `rows` to match `planned`: reuses rows in order, creates extras, soft-deletes leftovers. */
async function syncRows(
  repos: Repositories,
  rows: readonly Session[],
  planned: readonly PlannedOccurrence[],
  req: BookingRequest,
): Promise<Session[]> {
  const rule = req.repeat ? recurrenceRuleOf(req.repeat) : null;
  const out: Session[] = [];
  let seriesId = rule ? (rows[0]?.seriesId ?? rows[0]?.id ?? null) : null;
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    if (!p) continue;
    const fields = {
      clientId: req.clientId,
      startsAt: p.startMs,
      durationMin: p.durationMinutes,
      notes: req.notes,
      recurrence: i === 0 ? rule : null,
      ...(req.programId !== undefined ? { programId: req.programId } : {}),
    };
    const row = rows[i];
    if (row) {
      out.push(await repos.sessions.update(row.id, { ...fields, seriesId: rule ? seriesId : null }));
    } else {
      const created = await repos.sessions.create({ programId: null, ...fields, seriesId: seriesId, attendance: 'scheduled' });
      if (rule && seriesId === null) {
        seriesId = created.id;
        out.push(await repos.sessions.update(created.id, { seriesId }));
      } else {
        out.push(created);
      }
    }
  }
  for (const leftover of rows.slice(planned.length)) await repos.sessions.softDelete(leftover.id);
  return out;
}

export function createScheduleWriter({ repos, meta, clock }: ScheduleWriterDeps) {
  return {
    plan(req: BookingInput): Result<PlannedOccurrence[], RecurrenceError> {
      return planOccurrences(req, clock);
    },

    /** Books one session or a weekly series. */
    async book(req: BookingRequest): Promise<Result<{ sessions: Session[]; undo: Undo }, RecurrenceError>> {
      const planned = planOccurrences(req, clock);
      if (!planned.ok) return planned;
      const sessions = await syncRows(repos, [], planned.value, req);
      return ok({
        sessions,
        undo: async () => {
          for (const s of sessions) await repos.sessions.softDelete(s.id);
        },
      });
    },

    /**
     * Edits one occurrence (`scope: 'one'`, it leaves its series) or this and every later scheduled
     * occurrence of its series (`scope: 'series'`; earlier ones keep the old rule, which is cut off the day
     * before). A single session switched to "weekly" becomes the head of a new series.
     */
    async edit(session: Session, req: BookingRequest, scope: 'one' | 'series'): Promise<Result<{ sessions: Session[]; undo: Undo }, RecurrenceError>> {
      const planned = planOccurrences(scope === 'one' && session.seriesId ? { ...req, repeat: null } : req, clock);
      if (!planned.ok) return planned;
      const rows = scope === 'series' ? await futureOfSeries(repos, session) : [session];
      const snapshot = rows.map((r) => ({ ...r }));
      let cutHead: Session | null = null;
      if (scope === 'series' && session.seriesId) {
        const all = await repos.sessions.listByClient(session.clientId);
        const head = all.filter((s) => s.seriesId === session.seriesId && s.recurrence && s.startsAt < session.startsAt).sort(byStart).pop();
        if (head?.recurrence) {
          cutHead = { ...head };
          const splitDate = clock.toLocal(session.startsAt).date;
          await repos.sessions.update(head.id, { recurrence: { ...head.recurrence, until: addDays(splitDate, -1), count: null } });
        }
      }
      let sessions: Session[];
      if (scope === 'one' && session.seriesId) {
        sessions = [await repos.sessions.update(session.id, {
          clientId: req.clientId,
          startsAt: planned.value[0]?.startMs ?? session.startsAt,
          durationMin: req.durationMinutes,
          notes: req.notes,
          seriesId: null,
          recurrence: null,
          ...(req.programId !== undefined ? { programId: req.programId } : {}),
        })];
      } else {
        sessions = await syncRows(repos, rows, planned.value, req);
      }
      const keptIds = new Set(snapshot.map((s) => s.id));
      const createdIds = sessions.filter((s) => !keptIds.has(s.id)).map((s) => s.id);
      return ok({
        sessions,
        undo: async () => {
          for (const id of createdIds) await repos.sessions.softDelete(id);
          for (const s of snapshot) {
            const live = await repos.sessions.get(s.id);
            if (!live) await repos.sessions.restore(s.id);
            await repos.sessions.update(s.id, editableFields(s));
          }
          if (cutHead?.recurrence) await repos.sessions.update(cutHead.id, { recurrence: cutHead.recurrence });
        },
      });
    },

    /** Soft-deletes sessions; sessions that had used up a package session give it back. */
    async remove(sessions: readonly Session[]): Promise<Undo> {
      const late = await lateCancelIds(meta);
      const consuming = consumingStatuses(await readPrefs(meta));
      const changes = sessions.map((s) => ({ s, before: statusOf(s.attendance, late.has(s.id)) }));
      for (const s of sessions) await repos.sessions.softDelete(s.id);
      const byClient = new Map<string, typeof changes>();
      for (const c of changes) byClient.set(c.s.clientId, [...(byClient.get(c.s.clientId) ?? []), c]);
      for (const [clientId, list] of byClient) await applyUsage(repos, clientId, list.map((c) => ({ before: c.before, after: null })), consuming);
      return async () => {
        for (const s of sessions) await repos.sessions.restore(s.id);
        for (const [clientId, list] of byClient) await applyUsage(repos, clientId, list.map((c) => ({ before: null, after: c.before })), consuming);
      };
    },

    /** Records حضر / غاب / اعتذر متأخر (or clears it) and updates the client's remaining sessions. */
    async mark(session: Session, mark: MarkStatus | null): Promise<{ client: Client | null; undo: Undo }> {
      const late = await lateCancelIds(meta);
      // The policy at the time of the tap is used for the change and for its undo, so they cancel out.
      const consuming = consumingStatuses(await readPrefs(meta));
      const wasLate = late.has(session.id);
      const before = statusOf(session.attendance, wasLate);
      const prevAttendance = session.attendance;
      await repos.sessions.update(session.id, { attendance: storedAttendanceFor(mark) });
      await setLateCancel(meta, session.id, mark === 'lateCancel');
      await applyUsage(repos, session.clientId, [{ before, after: mark }], consuming);
      return {
        client: (await repos.clients.get(session.clientId)) ?? null,
        undo: async () => {
          await repos.sessions.update(session.id, { attendance: prevAttendance });
          await setLateCancel(meta, session.id, wasLate);
          await applyUsage(repos, session.clientId, [{ before: mark, after: before }], consuming);
        },
      };
    },
  };
}

export type ScheduleWriter = ReturnType<typeof createScheduleWriter>;

