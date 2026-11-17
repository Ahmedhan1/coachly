import type { AppServices } from '@/app/services';
import { buildPushSchedule, PUSH_MAX_ITEMS } from '@/domain/notifications';
import { addDays } from '@/domain/schedule';
import { computeOutbox } from '@/features/outbox/useOutbox';
import { toIsoDate, type ClientId, type ImageId } from '@/domain/models';
import { t } from '@/i18n';
import { deviceZone } from '@/features/schedule/zone';
import { storePhoto } from '@/features/nutrition/shared/photos';
import { NutritionStore } from '@/data/nutritionStore';
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
  // Daily digest at 9:00 local when the outbox has messages for that day (today if still before 9, and tomorrow).
  const clock = deviceZone().clock;
  const todayIso = clock.toLocal(now).date;
  for (const date of [todayIso, addDays(todayIso, 1)]) {
    const at = clock.toEpochMs({ date, minute: 9 * 60 });
    if (at <= now) continue;
    const count = (await computeOutbox(services, new Date(at), date).catch(() => [])).length;
    if (count > 0) items.push({ id: `digest-${date}`, at: Math.floor(at / 1000), title: t('outbox.digestTitle'), body: t('outbox.digestBody', { n: count }) });
  }
  items.sort((a, b) => a.at - b.at);
  const r = await push.sync(items.slice(0, PUSH_MAX_ITEMS));
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
  const store = new NutritionStore(services.meta, repos);
  const imported = await readImportedCheckins(services);
  let stored = 0;
  for (const c of pending.value) {
    const clientId = clientOf.get(c.shareId);
    if (!clientId) continue;
    // Already stored on an earlier pull whose delete did not reach the server: only retry the delete.
    if (imported.includes(c.id)) {
      await page.acknowledge(c);
      continue;
    }
    const photoIds: ImageId[] = [];
    let thumbId: string | null = null;
    if (c.doc.photo) {
      const blob = await dataUrlToBlob(c.doc.photo);
      if (blob) {
        try {
          const saved = await storePhoto(services, blob);
          photoIds.push(saved.imageId as ImageId);
          thumbId = saved.thumbId;
        } catch {
          // keep the numbers even if the photo cannot be read
        }
      }
    }
    const measurements: { weightKg?: number; waistCm?: number } = {};
    if (c.doc.weightKg !== undefined) measurements.weightKg = c.doc.weightKg;
    if (c.doc.waistCm !== undefined) measurements.waistCm = c.doc.waistCm;
    const entry = await repos.progress.create({
      clientId,
      date: toIsoDate(new Date(c.doc.createdAt * 1000)),
      measurements,
      photoIds,
      notes: c.doc.notes ?? '',
      source: 'client',
    });
    if (thumbId && photoIds[0]) await store.setEntryPhotos(entry.id, [{ imageId: photoIds[0], thumbId, pose: 'front' }]).catch(() => undefined);
    imported.push(c.id);
    await services.meta.set(IMPORTED_CHECKINS_KEY, imported.slice(-200));
    await page.acknowledge(c);
    stored++;
  }
  return stored;
}

/** Ids of check-ins already turned into progress entries (last 200), so a failed delete never duplicates one. */
export const IMPORTED_CHECKINS_KEY = 'clientPage.importedCheckins';

async function readImportedCheckins(services: AppServices): Promise<string[]> {
  const raw = await services.meta.get(IMPORTED_CHECKINS_KEY);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}
