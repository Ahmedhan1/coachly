import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { localDayRange, needsFollowUp, subscriptionAttention, toIsoDate, type Client, type ClientAttention } from '@/domain/models';
import { attentionRank, daysSinceCheckIn, planToday } from './homeModel';

export interface HomeData {
  trainerName: string;
  currency: string;
  now: Date;
  plan: ReturnType<typeof planToday>;
  attention: Array<{ client: Client; attention: ClientAttention }>;
  followUp: Array<{ client: Client; days: number | null }>;
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
  const { data } = useServices();
  const now = useMinuteClock();
  const today = toIsoDate(now);
  const { start, end } = localDayRange(now);

  const settings = useLive(() => data.repos.settings.get(), [data]);
  const clients = useLive(() => data.repos.clients.list(), [data]);
  const sessions = useLive(() => data.repos.sessions.listBetween(start, end), [data, start, end]);
  const lastCheckIns = useLive(() => data.repos.progress.lastCheckInByClient(), [data]);
  const hasDemo = useLive(() => data.hasDemoData(), [data]);

  if (!settings || !clients || !sessions || !lastCheckIns || hasDemo === undefined) return undefined;

  const byId = new Map(clients.map((c) => [c.id, c] as const));
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
  const followUp = clients
    .filter((c) => needsFollowUp(lastCheckIns.get(c.id) ?? null, today))
    .map((client) => ({ client, days: daysSinceCheckIn(lastCheckIns.get(client.id) ?? null, today) }));

  return {
    trainerName: settings.name,
    currency: settings.currency,
    now,
    plan: planToday(todaySessions, now.getTime()),
    attention,
    followUp,
    hasDemo,
  };
}
