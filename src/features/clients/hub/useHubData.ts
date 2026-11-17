import { useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { clientOverview, plannedDay, splitClientPrograms } from '@/domain/clientHub';
import { toIsoDate, type Client, type Payment, type Program, type ProgressEntry, type Session, type WorkoutLog } from '@/domain/models';
import { readActivePrograms } from '@/features/programs/activePrograms';
import { readSessionDays } from '@/features/schedule/sessionDays';

export interface HubData {
  payments: Payment[];
  sessions: Session[];
  programs: { active: Program | null; past: Program[] };
  progress: ProgressEntry[];
  logs: WorkoutLog[];
  currency: string;
  unit: 'kg' | 'lb';
  overview: ReturnType<typeof clientOverview<Session>>;
  /** The day the next session (or a fresh session) will run from the active program. */
  nextDay: { dayId: string; how: 'attached' | 'rotation' } | null;
  now: number;
  today: string;
}

/** Everything the client hub shows, read live from the repositories and combined by src/domain/clientHub. */
export function useHubData(client: Client): HubData | undefined {
  const { data, meta } = useServices();
  const repos = data.repos;
  const id = client.id;
  const [now] = useState(() => Date.now());
  const payments = useLive(() => repos.payments.listByClient(id), [repos, id]);
  const sessions = useLive(() => repos.sessions.listByClient(id), [repos, id]);
  const programs = useLive(() => repos.programs.listByClient(id), [repos, id]);
  const progress = useLive(() => repos.progress.listByClient(id), [repos, id]);
  const logs = useLive(() => repos.workoutLogs.listByClient(id), [repos, id]);
  const settings = useLive(() => repos.settings.get(), [repos]);
  const active = useLive(() => readActivePrograms(meta), [meta]);
  const sessionDays = useLive(() => readSessionDays(meta), [meta]);
  if (!payments || !sessions || !programs || !progress || !logs || !settings || !active || !sessionDays) return undefined;

  const today = toIsoDate(new Date(now));
  const split = splitClientPrograms(programs, id, active[id]);
  const lastCheckIn = progress[progress.length - 1]?.date ?? null;
  const overview = clientOverview({ client, sessions, payments, lastCheckIn, now, today });
  const program = split.active;
  const planned = program
    ? plannedDay({
        days: program.days,
        attachedDayId: overview.next && overview.next.programId === program.id ? sessionDays[overview.next.id] : null,
        logs,
        programId: program.id,
      })
    : null;
  return {
    payments,
    sessions,
    programs: split,
    progress,
    logs,
    currency: settings.currency,
    unit: settings.units.weight,
    overview,
    nextDay: planned ? { dayId: planned.day.id, how: planned.how } : null,
    now,
    today,
  };
}
