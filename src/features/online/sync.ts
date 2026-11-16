import type { AppServices } from '@/app/services';
import { buildPushSchedule } from '@/domain/notifications';
import { toIsoDate, type ClientId, type ImageId } from '@/domain/models';
import { t } from '@/i18n';
import { deviceZone } from '@/features/schedule/zone';
import { PHOTO_MAX_SIDE } from '@/features/nutrition/shared/photos';
import { readPushPrefs, readShare, savePushPrefs } from './prefs';

/** Rebuilds this device's push schedule from the next 40 days of sessions and subscription ends. */
export async function syncPush(services: AppServices, now = Date.now()): Promise<number | null> {
  const push = services.online?.push;
  if (!push) return null;
  const prefs = await readPushPrefs(services.meta);
  if (!prefs.enabled) return null;
  const repos = services.data.repos;
  const [sessions, clients] = await Promise.all([repos.sessions.listBetween(now, now + 41 * 86_400_000), repos.clients.list()]);
  const items = buildPushSchedule({
    now,
    clock: deviceZone().clock,
    leadMinutes: prefs.leadMinutes,
    renewalDaysBefore: prefs.renewalDays,
    renewalMinuteOfDay: 10 * 60,
    sessions,
    subscriptions: clients.flatMap((c) => (c.endDate ? [{ id: c.id, endDate: c.endDate }] : [])),
    texts: {
      session: (n) => ({ title: t('settings.notifications.sessionTitle'), body: t('settings.notifications.sessionBody', { n }) }),
      renewal: (n) => ({ title: t('settings.notifications.renewalTitle'), body: t('settings.notifications.renewalBody', { n }) }),
    },
  });
  const r = await push.sync(items);
  if (!r.ok) return null;
  await savePushPrefs(services.meta, { ...prefs, lastSyncAt: now });
  return r.value;
}

async function dataUrlToBlob(url: string): Promise<Blob | null> {
  try {
    return await (await fetch(url)).blob();
  } catch {
    return null;
  }
}

/** Pulls the clients' weekly check-ins into their progress (source "client"), then removes them from the server. */
export async function pullCheckins(services: AppServices): Promise<number> {
  const page = services.online?.clientPage;
  if (!page?.available) return 0;
  const repos = services.data.repos;
  const clients = await repos.clients.list();
  const shares = (await Promise.all(clients.map(async (c) => ({ clientId: c.id, share: await readShare(services.meta, c.id) })))).filter(
    (x): x is { clientId: ClientId; share: NonNullable<typeof x.share> } => x.share !== null,
  );
  if (shares.length === 0) return 0;
  const pending = await page.pending(shares.map((s) => s.share));
  if (!pending.ok) return 0;
  const clientOf = new Map(shares.map((s) => [s.share.shareId, s.clientId]));
  let stored = 0;
  for (const c of pending.value) {
    const clientId = clientOf.get(c.shareId);
    if (!clientId) continue;
    const photoIds: ImageId[] = [];
    if (c.doc.photo) {
      const blob = await dataUrlToBlob(c.doc.photo);
      if (blob) {
        try {
          const small = await services.images.downscale(blob, PHOTO_MAX_SIDE);
          photoIds.push((await repos.images.save(small)).id);
        } catch {
          // keep the numbers even if the photo cannot be read
        }
      }
    }
    const measurements: { weightKg?: number; waistCm?: number } = {};
    if (c.doc.weightKg !== undefined) measurements.weightKg = c.doc.weightKg;
    if (c.doc.waistCm !== undefined) measurements.waistCm = c.doc.waistCm;
    await repos.progress.create({
      clientId,
      date: toIsoDate(new Date(c.doc.createdAt * 1000)),
      measurements,
      photoIds,
      notes: c.doc.notes ?? '',
      source: 'client',
    });
    await page.acknowledge(c);
    stored++;
  }
  return stored;
}
