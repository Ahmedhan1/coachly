import { z } from 'zod';
import type { AppServices } from '@/app/services';
import { toIsoDate } from '@/domain/models';
import { addDays, toDayNumber } from '@/domain/schedule';
import type { MetaStore } from '@/services/meta/metaStore';
import { postWebhook, type WebhookEvent } from '@/services/integrations/webhook';

/** Device-local (`backup.` prefix, never inside a backup file): the trainer's own AI key. */
export const AI_KEY = 'backup.ai.apiKey';
export const WEBHOOK_KEY = 'integrations.webhook';

const webhookSchema = z.object({
  url: z.string().max(500),
  enabled: z.boolean(),
  clientCreated: z.boolean(),
  subscriptionEnding: z.boolean(),
  endingDays: z.number().int().min(1).max(14),
  /** Clients already announced (so each event fires once). */
  seenClients: z.array(z.string()).max(5000),
  sentEndings: z.array(z.string()).max(5000),
});
export type WebhookSettings = z.infer<typeof webhookSchema>;
export const DEFAULT_WEBHOOK: WebhookSettings = { url: '', enabled: false, clientCreated: true, subscriptionEnding: true, endingDays: 3, seenClients: [], sentEndings: [] };

export async function readWebhook(meta: MetaStore): Promise<WebhookSettings> {
  const r = webhookSchema.safeParse(await meta.get(WEBHOOK_KEY));
  return r.success ? r.data : DEFAULT_WEBHOOK;
}
export async function saveWebhook(meta: MetaStore, w: WebhookSettings): Promise<void> {
  await meta.set(WEBHOOK_KEY, webhookSchema.parse(w));
}

export async function readAiKey(meta: MetaStore): Promise<string | null> {
  const v = await meta.get(AI_KEY);
  return typeof v === 'string' && v ? v : null;
}

/**
 * Fires the trainer's webhook for new clients and subscriptions about to end. The first run only records
 * the existing clients (no flood of old "new client" events). Failed posts are retried on the next run.
 */
export async function runWebhooks(services: AppServices, now = new Date()): Promise<number> {
  const w = await readWebhook(services.meta);
  if (!w.enabled || !w.url) return 0;
  const clients = await services.data.repos.clients.list();
  const today = toIsoDate(now);
  const seen = new Set(w.seenClients);
  const firstRun = w.seenClients.length === 0;
  const sent = new Set(w.sentEndings);
  let delivered = 0;
  for (const c of clients) {
    if (!seen.has(c.id)) {
      if (!firstRun && w.clientCreated) {
        const ok = await postWebhook(w.url, { event: 'client_created', at: now.toISOString(), client: { id: c.id, name: c.name, phone: c.phone, endDate: c.endDate } });
        if (!ok) continue;
        delivered++;
      }
      seen.add(c.id);
    }
    if (w.subscriptionEnding && c.endDate && c.endDate >= today && c.endDate <= addDays(today, w.endingDays)) {
      const key = `${c.id}:${c.endDate}`;
      if (sent.has(key)) continue;
      const payload: WebhookEvent = {
        event: 'subscription_ending',
        at: now.toISOString(),
        client: { id: c.id, name: c.name, phone: c.phone, endDate: c.endDate },
        daysLeft: toDayNumber(c.endDate) - toDayNumber(today),
      };
      if (await postWebhook(w.url, payload)) {
        sent.add(key);
        delivered++;
      }
    }
  }
  await saveWebhook(services.meta, { ...w, seenClients: [...seen].slice(-5000), sentEndings: [...sent].slice(-5000) });
  return delivered;
}
