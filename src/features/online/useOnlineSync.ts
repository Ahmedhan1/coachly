import { useEffect } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { pullCheckins, syncPush } from './sync';

const EVERY_MS = 15 * 60_000;

/**
 * Background online extras while the app is open: refresh the push schedule and pull client check-ins at
 * start, when the network comes back, when the app returns to the foreground, and every 15 minutes.
 * Everything fails quietly (golden rule).
 */
export function useOnlineSync(active: boolean): void {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  useEffect(() => {
    if (!active || !services.online) return;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await syncPush(services).catch(() => null);
        const n = await pullCheckins(services).catch(() => 0);
        if (n > 0) showToast({ message: t('settings.clientPage.checkinArrived', { n }), duration: 4000 });
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
}
