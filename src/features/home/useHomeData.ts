import { useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { localDayRange, needsFollowUp, subscriptionAttention, toIsoDate, type Client, type ClientAttention, type Session } from '@/domain/models';

export interface HomeData {
  trainerName: string;
  now: Date;
  todaySessions: Array<{ session: Session; client: Client }>;
  attention: Array<{ client: Client; attention: ClientAttention }>;
  followUp: Client[];
  hasDemo: boolean;
}

/** Everything the home screen shows, derived by domain functions from repository data. */
export function useHomeData(): HomeData | undefined {
  const { data } = useServices();
  const [now] = useState(() => new Date());
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
    return client && session.attendance !== 'cancelled' ? [{ session, client }] : [];
  });
  const attention = clients.flatMap((client) => {
    const a = subscriptionAttention(client, today);
    return a ? [{ client, attention: a }] : [];
  });
  const followUp = clients.filter((c) => needsFollowUp(lastCheckIns.get(c.id) ?? null, today));

  return { trainerName: settings.name, now, todaySessions, attention, followUp, hasDemo };
}
