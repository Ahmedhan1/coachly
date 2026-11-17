import type { Repositories } from '@/data';
import { sessionForWorkout } from '@/domain/clientHub';
import { localDayRange, type Client, type ClientId, type IsoDate, type Session, type WorkoutLog } from '@/domain/models';
import { toWorkoutLogInput, type SessionState } from '@/domain/programs';
import type { ZonedClock } from '@/domain/schedule';
import type { ScheduleWriter } from '@/features/schedule/scheduleWriter';

export interface SaveWorkoutDeps {
  repos: Repositories;
  writer: ScheduleWriter;
  clock: ZonedClock;
}

export interface SavedWorkout {
  log: WorkoutLog;
  /** The booking the workout counted as: marked «حضر», so the package count follows. */
  session: Session | null;
  client: Client | null;
}

const MINUTE = 60_000;

/**
 * Saving session mode: the workout log goes into the client's history and the booking it belongs to is
 * marked attended (the one it was started from, else today's still-scheduled one, else a new booking at the
 * time it started), so attendance and the package's remaining sessions stay right.
 */
export async function saveWorkout({ repos, writer, clock }: SaveWorkoutDeps, state: SessionState, date: IsoDate, now: Date): Promise<SavedWorkout> {
  const clientId = state.clientId as ClientId;
  let session: Session | null = state.scheduleSessionId ? ((await repos.sessions.get(state.scheduleSessionId)) ?? null) : null;
  if (!session) {
    const { start, end } = localDayRange(new Date(state.startedAt));
    session = sessionForWorkout(await repos.sessions.listByClient(clientId), start, end, state.startedAt);
  }
  if (!session) {
    const local = clock.toLocal(state.startedAt);
    const minutes = Math.round((now.getTime() - state.startedAt) / MINUTE / 5) * 5;
    const booked = await writer.book({
      clientId,
      notes: '',
      date: local.date,
      startMinute: local.minute,
      durationMinutes: Math.min(240, Math.max(30, minutes)),
      repeat: null,
      programId: state.programId as Session['programId'],
    });
    session = booked.ok ? (booked.value.sessions[0] ?? null) : null;
  }
  const log = await repos.workoutLogs.create(toWorkoutLogInput({ ...state, scheduleSessionId: session?.id ?? state.scheduleSessionId }, date));
  let client: Client | null = (await repos.clients.get(clientId)) ?? null;
  if (session && session.attendance === 'scheduled') client = (await writer.mark(session, 'attended')).client;
  return { log, session, client };
}
