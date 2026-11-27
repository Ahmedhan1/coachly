import { useEffect, useRef } from 'react';
import { readActivity } from '@/data/prefs/activity';
import type { ActivityEvent } from '@/domain/notifications';
import { clientUrl } from '@/features/clients/hub/links';
import { useLive } from '@/app/useLive';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { useBrandAssets } from '@/features/identity/useBrandAssets';
import { runWebhooks } from './integrations';
import { pagesSignature, republishChangedPages } from './clientPagePublish';
import { pullCheckins, pushScheduleSignature, syncPush } from './sync';
import { pullClientPhotos } from '@/features/files/pullClientPhotos';
import { syncRoster } from '@/features/team/rosterSync';
import { recoverPhotosIfPending } from '@/features/files/photoRecovery';
import { shouldRunSync, SYNC_EVERY_MS, type SyncReason } from './syncThrottle';

/** Wait after the last data change before re-uploading pages (editing a program is many small saves). */
const REPUBLISH_DEBOUNCE_MS = 8_000;
/** Wait after a session or package change before re-sending the push schedule. */
const PUSH_DEBOUNCE_MS = 5_000;

/** Message from public/push-sw.js: a push arrived, or its notification was tapped. */
function isPushMessage(data: unknown): data is { type: 'pt-push' | 'pt-push-open'; id: string } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (d.type === 'pt-push' || d.type === 'pt-push-open') && typeof d.id === 'string';
}

/**
 * Background online extras while the app is open: refresh the push schedule and pull client check-ins at
 * start, when the network comes back, when the app returns to the foreground and every 30 minutes, but a
 * foreground return or the timer never runs it twice within 10 minutes (syncThrottle: request budget).
 * Everything fails quietly (golden rule).
 */
export function useOnlineSync(active: boolean, navigate?: (to: string) => void): void {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  // Not network work, but it needs the same "app is ready" moment: launch splash + home-screen icon cache.
  useBrandAssets(active);
  useEffect(() => {
    if (!active || !services.online) return;
    let running = false;
    let lastRunAt: number | null = null;
    const run = async (reason: SyncReason) => {
      if (running || !shouldRunSync(reason, lastRunAt, Date.now())) return;
      running = true;
      lastRunAt = Date.now();
      try {
        await syncPush(services, Date.now(), { skipUnchanged: true }).catch(() => null);
        await runWebhooks(services).catch(() => 0);
        const before = new Set((await readActivity(services.meta).catch(() => [] as ActivityEvent[])).map((e) => e.id));
        await pullCheckins(services).catch(() => 0);
        // Photos clients sent from their page, then every queued upload/delete of photos, receipts and PDFs.
        await pullClientPhotos(services).catch(() => [] as string[]);
        // Who sent what: the toast names the client and opens them; everything stays on Home ("new from clients").
        const fresh = (await readActivity(services.meta).catch(() => [] as ActivityEvent[])).filter((e) => !e.seen && !before.has(e.id));
        if (fresh.length > 0) {
          const first = fresh[0] as ActivityEvent;
          const one = fresh.length === 1 || fresh.every((e) => e.clientId === first.clientId && e.kind === first.kind);
          const name = one ? ((await services.data.repos.clients.get(first.clientId).catch(() => null))?.name ?? '') : '';
          showToast({
            message: one && name ? t(first.kind === 'photo' ? 'home.activity.toastPhoto' : 'home.activity.toastCheckin', { name }) : t('home.activity.toastMany', { n: fresh.length }),
            actionLabel: t('home.activity.open'),
            onAction: () => navigateRef.current?.(one && name ? clientUrl(first.clientId, 'progress') : '/'),
            duration: 10_000,
          });
        }
        await services.online?.files?.run().catch(() => null);
        // After a cloud restore: full-size photos come back from the encrypted copies in the bucket.
        const back = await recoverPhotosIfPending(services).catch(() => 0);
        if (back > 0) showToast({ message: t('files.recovered', { n: back }), duration: 4000 });
        // Pages whose data changed (or failed to upload last time) go up again; unchanged ones are skipped.
        await republishChangedPages(services).catch(() => 0);
        // Gym trainers: the encrypted client summary for the gym manager (at most every 30 minutes).
        await syncRoster(services, new Date()).catch(() => false);
      } finally {
        running = false;
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void run('visible');
    const onOnline = () => void run('online');
    // A client did something (check-in, photo): pull it now, whatever the throttle says.
    const onPush = (e: MessageEvent) => {
      if (!isPushMessage(e.data) || !e.data.id.startsWith('evt-')) return;
      void run('online');
      if (e.data.type === 'pt-push-open') navigateRef.current?.('/');
    };
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    void run('start');
    const timer = window.setInterval(() => void run('timer'), SYNC_EVERY_MS);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    sw?.addEventListener('message', onPush);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      sw?.removeEventListener('message', onPush);
    };
  }, [active, services, showToast]);

  // Re-send the push schedule shortly after a session or a package end changes (not only at the next sync run),
  // so a reminder for a session booked a minute ago is already on the server when the app is closed.
  const pushSignature = useLive(
    () => (active && services.online ? pushScheduleSignature(services).catch(() => '') : Promise.resolve('')),
    [active, services],
  );
  useEffect(() => {
    if (!active || !services.online || !pushSignature) return;
    const timer = window.setTimeout(() => void syncPush(services, Date.now(), { skipUnchanged: true }).catch(() => null), PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, services, pushSignature]);

  // Republish the clients' pages shortly after the data they show changes.
  const signature = useLive(() => (active && services.online ? pagesSignature(services).catch(() => '') : Promise.resolve('')), [active, services]);
  useEffect(() => {
    if (!active || !services.online || !signature) return;
    const timer = window.setTimeout(() => void republishChangedPages(services).catch(() => 0), REPUBLISH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, services, signature]);
}
