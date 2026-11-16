import { useMemo, useState } from 'react';
import { z } from 'zod';
import type { AppServices } from '@/app/services';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { toIsoDate, type Client } from '@/domain/models';
import { buildOutbox, OUTBOX_KINDS, type OutboxItem, type OutboxKind } from '@/domain/outbox';
import type { MetaStore } from '@/services/license/metaStore';
import { deviceZone } from '@/features/schedule/zone';

const SENT_KEY = 'outbox.sent';
const KINDS_KEY = 'outbox.kinds';
const sentSchema = z.array(z.object({ id: z.string(), at: z.number() })).max(5000);

export async function readSent(meta: MetaStore): Promise<{ id: string; at: number }[]> {
  const r = sentSchema.safeParse(await meta.get(SENT_KEY));
  return r.success ? r.data : [];
}

export async function markSent(meta: MetaStore, id: string, sent: boolean): Promise<void> {
  const now = Date.now();
  const list = (await readSent(meta)).filter((x) => x.id !== id && now - x.at < 120 * 86_400_000);
  await meta.set(SENT_KEY, sent ? [...list, { id, at: now }] : list);
}

export async function readKinds(meta: MetaStore): Promise<Set<OutboxKind>> {
  const r = z.array(z.enum(OUTBOX_KINDS as [OutboxKind, ...OutboxKind[]])).safeParse(await meta.get(KINDS_KEY));
  return new Set(r.success ? r.data : OUTBOX_KINDS);
}

export async function saveKinds(meta: MetaStore, kinds: ReadonlySet<OutboxKind>): Promise<void> {
  await meta.set(KINDS_KEY, [...kinds]);
}

/** Builds the outbox for a given local date from the repositories (also used for the daily push digest). */
export async function computeOutbox(services: Pick<AppServices, 'data' | 'meta'>, now: Date, today = toIsoDate(now)): Promise<OutboxItem[]> {
  const repos = services.data.repos;
  const clock = deviceZone().clock;
  const start = now.getTime() - 3 * 86_400_000;
  const [clients, sessions, payments, lastCheckIn, sent, kinds] = await Promise.all([
    repos.clients.list(),
    repos.sessions.listBetween(start, now.getTime() + 3 * 86_400_000),
    repos.payments.list(),
    repos.progress.lastCheckInByClient(),
    readSent(services.meta),
    readKinds(services.meta),
  ]);
  return buildOutbox({
    today,
    dateOf: (ms) => clock.toLocal(ms).date,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      birthDate: c.birthDate,
      endDate: c.endDate,
      remainingSessions: c.remainingSessions,
      hasPackage: c.package !== null && c.package.totalSessions > 0,
      createdOn: toIsoDate(new Date(c.createdAt)),
      isDemo: c.demo === true,
    })),
    sessions,
    payments: payments.map((p) => ({ id: p.id, clientId: p.clientId, status: p.status, dueOn: p.dueOn, amountMinor: p.amountMinor })),
    lastCheckIn,
    sent: new Set(sent.map((s) => s.id)),
    enabled: kinds,
  });
}

export function useOutbox(): { items: OutboxItem[]; clients: ReadonlyMap<string, Client>; refresh: () => void } | undefined {
  const services = useServices();
  const [version, setVersion] = useState(0);
  const items = useLive(() => computeOutbox(services, new Date()), [services, version]);
  const clientsList = useLive(() => services.data.repos.clients.list(), [services]);
  const clients = useMemo(() => new Map<string, Client>((clientsList ?? []).map((c) => [c.id, c])), [clientsList]);
  if (!items || !clientsList) return undefined;
  return { items, clients, refresh: () => setVersion((v) => v + 1) };
}
