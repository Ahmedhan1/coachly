import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { Button, IconButton } from '@/ui';
import { startAppServiceWorker, type AppServiceWorker } from './swUpdate';
import styles from './UpdateBanner.module.css';

/** Registers the service worker and shows a banner while a new version is waiting (src/app/swUpdate.ts). */
export function UpdateBanner() {
  const [worker, setWorker] = useState<AppServiceWorker | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void startAppServiceWorker(() => {
      if (!cancelled) setWaiting(true);
    }).then((w) => {
      if (!cancelled) setWorker(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting || !worker) return null;
  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>{t('settings.update.available')}</p>
      <Button
        size="small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void worker.applyUpdate().catch(() => setBusy(false));
        }}
      >
        {t('settings.update.apply')}
      </Button>
      <IconButton icon="close" tone="muted" label={t('common.close')} onClick={() => setWaiting(false)} />
    </div>
  );
}
