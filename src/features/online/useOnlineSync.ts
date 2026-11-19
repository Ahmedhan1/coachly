import { useEffect } from 'react';
import { useLive } from '@/app/useLive';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { useBrandAssets } from '@/features/identity/useBrandAssets';
import { runWebhooks } from './integrations';
import { pagesSignature, republishChangedPages } from './clientPagePublish';
import { pullCheckins, syncPush } from './sync';
import { pullClientPhotos } from '@/features/files/pullClientPhotos';

/** Wait after the last data change before re-uploading pages (editing a program is many small saves). */
const REPUBLISH_DEBOUNCE_MS = 20_000;

const EVERY_MS = 15 * 60_000;

/**
 * Background online extras while the app is open: refresh the push schedule and pull client check-ins at
 * start, when the network comes back, when the app returns to the foreground, and every 15 minutes.
 * Everything fails quietly (golden rule).
 */
export function useOnlineSync(active: boolean): void {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  // Not network work, but it needs the same "app is ready" moment: launch splash + home-screen icon cache.
  useBrandAssets(active);
  useEffect(() => {
    if (!active || !services.online) return;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await syncPush(services).catch(() => null);
        await runWebhooks(services).catch(() => 0);
        const n = await pullCheckins(services).catch(() => 0);
        if (n > 0) showToast({ message: t('settings.clientPage.checkinArrived', { n }), duration: 4000 });
        // Photos clients sent from their page, then every queued upload/delete of photos, receipts and PDFs.
        const photos = await pullClientPhotos(services).catch(() => [] as string[]);
        if (photos.length === 1) showToast({ message: t('files.clientPhoto.arrived', { name: photos[0] ?? '' }), duration: 4000 });
        else if (photos.length > 1) showToast({ message: t('files.clientPhoto.arrivedMany', { n: photos.length }), duration: 4000 });
        await services.online?.files?.run().catch(() => null);
        // Pages whose data changed (or failed to upload last time) go up again; unchanged ones are skipped.
        await republishChangedPages(services).catch(() => 0);
      } finally {
        running = false;
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void run();
    void run();
    const timer = window.setInterval(() => void run(), EVERY_MS);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, services, showToast]);

  // Republish the clients' pages shortly after the data they show changes.
  const signature = useLive(() => (active && services.online ? pagesSignature(services).catch(() => '') : Promise.resolve('')), [active, services]);
  useEffect(() => {
    if (!active || !services.online || !signature) return;
    const timer = window.setTimeout(() => void republishChangedPages(services).catch(() => 0), REPUBLISH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, services, signature]);
}
