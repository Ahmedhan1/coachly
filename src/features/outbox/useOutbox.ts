import { useMemo, useState } from 'react';
import { z } from 'zod';
import type { AppServices } from '@/app/services';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { toIsoDate, type Client } from '@/domain/models';
import { buildOutbox, OUTBOX_KINDS, SENT_LOG_MAX_ENTRIES, updateSentLog, type OutboxItem, type OutboxKind, type SentEntry } from '@/domain/outbox';
import type { MetaStore } from '@/services/meta/metaStore';
import { deviceZone } from '@/features/schedule/zone';

const SENT_KEY = 'outbox.sent';
const KINDS_KEY = 'outbox.kinds';
const sentEntrySchema = z.object({ id: z.string(), at: z.number() });

/** Tolerant read: bad entries are skipped and only the newest entries are kept, never the whole log dropped. */
export async function readSent(meta: MetaStore): Promise<SentEntry[]> {
  const raw: unknown = await meta.get(SENT_KEY);
  if (!Array.isArray(raw)) return [];
  const entries: SentEntry[] = [];
  for (const item of raw) {
    const r = sentEntrySchema.safeParse(item);
    if (r.success) entries.push(r.data);
  }
  return entries.length > SENT_LOG_MAX_ENTRIES ? entries.slice(entries.length - SENT_LOG_MAX_ENTRIES) : entries;
}

export async function markSent(meta: MetaStore, id: string, sent: boolean, now: Date): Promise<void> {
  await meta.set(SENT_KEY, updateSentLog(await readSent(meta), id, sent, now.getTime()));
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
    repos.payments.listDue(), // the outbox only ever reminds about unpaid charges
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
