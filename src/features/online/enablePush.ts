import type { AppServices } from '@/app/services';
import type { PushError } from '@/services/push/pushService';
import { readPushPrefs, savePushPrefs } from './prefs';
import { syncPush } from './sync';

export type EnablePushOutcome = { ok: true; scheduled: number | null } | { ok: false; error: PushError | 'unavailable' };

/**
 * Turns Web Push on for this phone: permission (must run inside a tap — iOS 16.4+ standalone and Android
 * Chrome both require it), subscription sent to the Worker, then the first schedule sync (generic texts
 * only, never client names). Used by Settings → الإشعارات and by the one-time prompt after the first booking.
 * Never throws.
 */
export async function enablePushNotifications(services: AppServices): Promise<EnablePushOutcome> {
  const push = services.online?.push;
  if (!push) return { ok: false, error: 'unavailable' };
  try {
    const r = await push.enable();
    if (!r.ok) return { ok: false, error: r.error };
    const prefs = await readPushPrefs(services.meta);
    await savePushPrefs(services.meta, { ...prefs, enabled: true });
    return { ok: true, scheduled: await syncPush(services) };
  } catch {
    return { ok: false, error: 'subscribe_failed' };
  }
}
