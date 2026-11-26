import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { followUps, plannedDay, splitClientPrograms, type FollowUpReason } from '@/domain/clientHub';
import { localDayRange, subscriptionAttention, toIsoDate, type Client, type ClientAttention } from '@/domain/models';
import { readActivePrograms } from '@/data/prefs/activePrograms';
import { programDayName } from '@/i18n/programNames';
import { readSessionDays } from '@/data/prefs/sessionDays';
import { attentionRank, localWeekRange, planToday } from './homeModel';

export interface HomeData {
  trainerName: string;
  currency: string;
  now: Date;
  plan: ReturnType<typeof planToday>;
  attention: Array<{ client: Client; attention: ClientAttention }>;
  followUp: Array<{ client: Client; reasons: FollowUpReason[] }>;
  /** "Program · day" for each of today's sessions (by session id), when the client has a program. */
  sessionPlans: ReadonlyMap<string, string>;
  hasDemo: boolean;
}

/** Re-renders once a minute so "in 40 minutes" and the next session stay right. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Everything the home screen shows, derived by domain functions from repository data. */
export function useHomeData(): HomeData | undefined {
  const { data, meta } = useServices();
  const repos = data.repos;
  const now = useMinuteClock();
  const today = toIsoDate(now);
  const { start, end } = localDayRange(now);
  const week = localWeekRange(now);

  const settings = useLive(() => repos.settings.get(), [repos]);
  const clients = useLive(() => repos.clients.list(), [repos]);
  const sessions = useLive(() => repos.sessions.listBetween(start, end), [repos, start, end]);
  const weekSessions = useLive(() => repos.sessions.listBetween(week.start, week.end), [repos, week.start, week.end]);
  const duePayments = useLive(() => repos.payments.listDue(), [repos]);
  const lastCheckIns = useLive(() => repos.progress.lastCheckInByClient(), [repos]);
  const hasDemo = useLive(() => data.hasDemoData(), [data]);
  const sessionPlans = useLive(async () => {
    const out = new Map<string, string>();
    const list = sessions ?? [];
    if (list.length === 0) return out;
    const [active, days] = await Promise.all([readActivePrograms(meta), readSessionDays(meta)]);
    for (const clientId of new Set(list.map((s) => s.clientId))) {
      const [programs, logs] = await Promise.all([repos.programs.listByClient(clientId), repos.workoutLogs.listByClient(clientId)]);
      const fallback = splitClientPrograms(programs, clientId, active[clientId]).active;
      for (const s of list.filter((x) => x.clientId === clientId)) {
        const program = programs.find((p) => p.id === s.programId) ?? fallback;
        if (!program) continue;
        const day = plannedDay({ days: program.days, attachedDayId: days[s.id], logs, programId: program.id });
        const name = day ? programDayName(program.days, day.day.id) : '';
        out.set(s.id, name ? `${program.name} · ${name}` : program.name);
      }
    }
    return out;
  }, [repos, meta, sessions]);

  if (!settings || !clients || !sessions || !weekSessions || !duePayments || !lastCheckIns || hasDemo === undefined || !sessionPlans) return undefined;

  const byId = new Map<string, Client>(clients.map((c) => [c.id, c]));
  const todaySessions = sessions.flatMap((session) => {
    const client = byId.get(session.clientId);
    return client ? [{ session, client }] : [];
  });
  const attention = clients
    .flatMap((client) => {
      const a = subscriptionAttention(client, today);
      return a ? [{ client, attention: a }] : [];
    })
    .sort((x, y) => attentionRank(x.attention) - attentionRank(y.attention));
  const bookedThisWeek = new Set(weekSessions.filter((s) => s.attendance !== 'cancelled').map((s) => s.clientId));
  const followUp = followUps({ clients, duePayments, lastCheckIns, bookedThisWeek, today }).flatMap((f) => {
    const client = byId.get(f.clientId);
    return client ? [{ client, reasons: f.reasons }] : [];
  });

  return {
    trainerName: settings.name,
    currency: settings.currency,
    now,
    plan: planToday(todaySessions, now.getTime()),
    attention,
    followUp,
    sessionPlans,
    hasDemo,
  };
}
