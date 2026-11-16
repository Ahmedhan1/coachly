import { useEffect } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { ExercisePack } from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, Sheet } from '@/ui';
import { formatBytes } from '@/ui/format';
import { useOfflineDownload } from './offlineDownload';
import styles from './Sheets.module.css';

/** Settings-like panel: size, progress, cancel/resume, and storage used. Reusable outside the sheet. */
export function OfflinePhotosPanel({ pack }: { pack: ExercisePack }) {
  const { storage } = useServices();
  const { running, progress, result, status, refresh, start, cancel } = useOfflineDownload();
  useEffect(() => {
    void refresh(pack);
  }, [pack, refresh]);
  const estimate = useLive(() => storage.estimate(), [storage, running, status]);

  const total = status?.totalFiles ?? 0;
  const done = running ? (progress?.doneFiles ?? 0) : (status?.cachedFiles ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = !running && total > 0 && done >= total;
  const partial = !running && done > 0 && !complete;

  return (
    <div className={styles.form}>
      <p className={styles.lead}>{t('training.library.offline.lead')}</p>
      <p className={styles.stat}>{t('training.library.offline.size', { size: formatBytes(pack.imageBytes) })}</p>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('training.library.offline.title')}
      >
        <div className={styles.barFill} style={{ inlineSize: `${pct}%` }} />
      </div>
      <p className={styles.stat} aria-live="polite">
        {running && progress
          ? t('training.library.offline.progress', {
              done: progress.doneFiles,
              total: progress.totalFiles,
              mb: formatBytes(progress.doneBytes),
              totalMb: formatBytes(progress.totalBytes),
            })
          : complete
            ? t('training.library.offline.done')
            : t('training.library.offline.status', { done, total })}
      </p>
      {result && result.failedFiles > 0 && <p className={styles.error}>{t('training.library.offline.failed', { n: result.failedFiles })}</p>}
      {result?.cancelled && <p className={styles.note}>{t('training.library.offline.cancelled')}</p>}
      {running ? (
        <Button variant="secondary" block onClick={cancel}>
          {t('training.library.offline.cancel')}
        </Button>
      ) : (
        !complete && (
          <Button block onClick={() => void start(pack)}>
            {partial ? t('training.library.offline.resume') : t('training.library.offline.start')}
          </Button>
        )
      )}
      <p className={styles.note}>
        {estimate
          ? t('training.library.offline.storage', { used: formatBytes(estimate.usageBytes), quota: formatBytes(estimate.quotaBytes) })
          : t('training.library.offline.storageUnknown')}
      </p>
    </div>
  );
}

export function OfflinePhotosSheet({ pack, onClose }: { pack: ExercisePack; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={t('training.library.offline.title')} cancelLabel={t('common.close')}>
      <OfflinePhotosPanel pack={pack} />
    </Sheet>
  );
}
