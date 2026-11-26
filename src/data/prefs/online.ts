import { z } from 'zod';
import type { MetaStore } from '@/data/metaStore';

/** Device-local (`backup.` prefix → never inside a backup): the push subscription belongs to this phone. */
export const PUSH_PREFS_KEY = 'backup.push';
export const CLIENT_PAGES_ENABLED_KEY = 'clientPage.enabled';
export const clientShareKey = (clientId: string) => `clientPage.share.${clientId}`;

const pushPrefsSchema = z.object({
  enabled: z.boolean(),
  leadMinutes: z.number().int().min(0).max(240),
  renewalDays: z.number().int().min(0).max(14),
  lastSyncAt: z.number().nullable(),
});
export type PushPrefs = z.infer<typeof pushPrefsSchema>;
export const DEFAULT_PUSH_PREFS: PushPrefs = { enabled: false, leadMinutes: 30, renewalDays: 2, lastSyncAt: null };

export async function readPushPrefs(meta: MetaStore): Promise<PushPrefs> {
  const r = pushPrefsSchema.safeParse(await meta.get(PUSH_PREFS_KEY));
  return r.success ? r.data : DEFAULT_PUSH_PREFS;
}
export async function savePushPrefs(meta: MetaStore, prefs: PushPrefs): Promise<void> {
  await meta.set(PUSH_PREFS_KEY, pushPrefsSchema.parse(prefs));
}

export async function clientPagesEnabled(meta: MetaStore): Promise<boolean> {
  return (await meta.get(CLIENT_PAGES_ENABLED_KEY)) !== false;
}

const shareRecordSchema = z.object({
  shareId: z.string().min(16).max(64),
  key: z.string().min(40).max(64),
  checkinsEnabled: z.boolean(),
  publishedAt: z.number().nullable(),
  /** Fingerprint of the last uploaded document (skip re-uploads of an unchanged page). */
  docHash: z.string().max(64).optional(),
});
export type ShareRecord = z.infer<typeof shareRecordSchema>;

export async function readShare(meta: MetaStore, clientId: string): Promise<ShareRecord | null> {
  const r = shareRecordSchema.safeParse(await meta.get(clientShareKey(clientId)));
  return r.success ? r.data : null;
}
export async function saveShare(meta: MetaStore, clientId: string, record: ShareRecord | null): Promise<void> {
  await meta.set(clientShareKey(clientId), record ? shareRecordSchema.parse(record) : null);
}
