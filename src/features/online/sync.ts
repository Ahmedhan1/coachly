import type { AppServices } from '@/app/services';
import { buildPushSchedule, PUSH_MAX_ITEMS } from '@/domain/notifications';
import { addDays } from '@/domain/schedule';
import { computeOutbox } from '@/features/outbox/useOutbox';
import { toIsoDate, type ClientId, type ImageId } from '@/domain/models';
import { t } from '@/i18n';
import { deviceZone } from '@/app/deviceZone';
import { storePhoto } from '@/features/nutrition/shared/photos';
import { NutritionStore } from '@/data/nutritionStore';
import { mealPicksKey, parseMealPicks } from '@/domain/meals';
import { entryNavyEstimate } from '@/domain/nutrition';
import { readPushPrefs, readShare, savePushPrefs } from '@/data/prefs/online';
import { recordActivity } from '@/data/prefs/activity';
import { shouldSendPushSchedule } from './syncThrottle';

/** Device-local (`backup.` prefix: never in a backup): fingerprint of the last schedule the server accepted. */
const PUSH_SENT_KEY = 'backup.push.sent';

function readSent(v: unknown): { fingerprint: string; at: number } | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  return typeof r.fingerprint === 'string' && typeof r.at === 'number' ? { fingerprint: r.fingerprint, at: r.at } : null;
}

/**
 * Rebuilds this device's push schedule from the next 40 days of sessions and subscription ends.
 * `skipUnchanged` (background sync): an identical schedule sent recently is not sent again (saves a request).
 */
export async function syncPush(services: AppServices, now = Date.now(), opts: { skipUnchanged?: boolean } = {}): Promise<number | null> {
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
  const batch = items.slice(0, PUSH_MAX_ITEMS);
  const fingerprint = JSON.stringify(batch);
  if (opts.skipUnchanged && !shouldSendPushSchedule({ fingerprint, last: readSent(await services.meta.get(PUSH_SENT_KEY)), now })) return null;
  const r = await push.sync(batch);
  if (!r.ok) return null;
  await savePushPrefs(services.meta, { ...prefs, lastSyncAt: now });
  await services.meta.set(PUSH_SENT_KEY, { fingerprint, at: now });
  return r.value;
}

/** Cheap signature of what the push schedule is built from (sessions ahead, package ends, push settings). */
export async function pushScheduleSignature(services: AppServices, now = Date.now()): Promise<string> {
  const prefs = await readPushPrefs(services.meta);
  if (!prefs.enabled) return 'off';
  const repos = services.data.repos;
  const dayStart = now - (now % 86_400_000);
  const [sessions, clients] = await Promise.all([repos.sessions.listBetween(dayStart, dayStart + 41 * 86_400_000), repos.clients.list()]);
  const s = sessions.map((x) => `${x.id}@${x.startsAt}:${x.attendance}`).join(',');
  const c = clients.map((x) => `${x.id}:${x.endDate ?? ''}`).join(',');
  return `${prefs.leadMinutes}/${prefs.renewalDays}|${s}|${c}`;
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
  const nutrition = await store.getSettings().catch(() => null);
  const clientById = new Map(clients.map((c) => [c.id as string, c]));
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
    const photos: { imageId: string; thumbId: string; pose: 'front' | 'side' | 'back' }[] = [];
    const poses = ['front', 'side', 'back'] as const;
    const urls = [c.doc.photo, ...(c.doc.photos ?? [])].filter((u): u is string => typeof u === 'string').slice(0, 3);
    for (const [i, url] of urls.entries()) {
      const blob = await dataUrlToBlob(url);
      if (!blob) continue;
      try {
        const saved = await storePhoto(services, blob);
        photoIds.push(saved.imageId as ImageId);
        photos.push({ imageId: saved.imageId, thumbId: saved.thumbId, pose: poses[i] ?? 'front' });
      } catch {
        // keep the numbers even if a photo cannot be read
      }
    }
    const d = c.doc;
    const measurements: Partial<Record<'weightKg' | 'waistCm' | 'neckCm' | 'hipCm' | 'chestCm' | 'armCm' | 'thighCm' | 'bodyFatPercent', number>> = {};
    for (const k of ['weightKg', 'waistCm', 'neckCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'] as const) if (d[k] !== undefined) measurements[k] = d[k];
    // Neck + waist (+ hip for women) with the client's height on file: body fat by the Navy formula.
    const client = clientById.get(clientId);
    const navy = entryNavyEstimate(measurements, { sex: client?.gender ?? null, heightCm: client?.measurements.heightCm }, nutrition?.navy, nutrition?.limits);
    if (navy.status === 'estimated') measurements.bodyFatPercent = navy.bodyFatPercent;
    // Sleep, energy and adherence have no field of their own: they go first in the entry's notes.
    const week = [
      d.sleepHours !== undefined ? t('settings.clientPage.checkinSleep', { n: d.sleepHours }) : '',
      d.energy !== undefined ? t('settings.clientPage.checkinEnergy', { n: d.energy }) : '',
      d.adherence !== undefined ? t('settings.clientPage.checkinAdherence', { n: d.adherence }) : '',
    ].filter(Boolean);
    const notes = [week.join(' · '), d.notes ?? ''].filter(Boolean).join('\n');
    const entry = await repos.progress.create({
      clientId,
      date: toIsoDate(new Date(c.doc.createdAt * 1000)),
      measurements,
      photoIds,
      notes: notes.slice(0, 4000),
      source: 'client',
      ...(navy.status === 'estimated' ? { bodyFatSource: 'navy' as const } : {}),
    });
    if (d.mealPicks) await saveMealPicks(services, clientId, d.createdAt, d.mealPicks);
    if (photos.length > 0) await store.setEntryPhotos(entry.id, photos).catch(() => undefined);
    // The trainer's inbox: who sent it, when, and the start of what they wrote (a question, a note).
    await recordActivity(services.meta, [{ id: `chk-${c.id}`, kind: 'checkin', clientId, at: d.createdAt * 1000, seen: false, ...(d.notes?.trim() ? { note: d.notes } : {}) }]).catch(() => undefined);
    imported.push(c.id);
    await services.meta.set(IMPORTED_CHECKINS_KEY, imported.slice(-200));
    await page.acknowledge(c);
    stored++;
  }
  return stored;
}

/** Keeps the newest check-in's meal picks for the trainer to see (an older check-in never overwrites them). */
async function saveMealPicks(services: AppServices, clientId: ClientId, at: number, picks: { id: string; o: number }[]): Promise<void> {
  const key = mealPicksKey(clientId);
  const current = parseMealPicks(await services.meta.get(key));
  if (current && current.at > at) return;
  await services.meta.set(key, { at, picks });
}

/** Ids of check-ins already turned into progress entries (last 200), so a failed delete never duplicates one. */
export const IMPORTED_CHECKINS_KEY = 'clientPage.importedCheckins';

async function readImportedCheckins(services: AppServices): Promise<string[]> {
  const raw = await services.meta.get(IMPORTED_CHECKINS_KEY);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}
