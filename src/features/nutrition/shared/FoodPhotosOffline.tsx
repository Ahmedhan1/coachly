import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { Button, TitleIcon } from '@/ui';
import { cachedFoodPhotoCount, downloadFoodPhotos, type FoodPhotoProgress } from './foodPhotos';
import styles from './FoodPhotosOffline.module.css';

/** Average size of one bundled photo, for the "about N MB" hint. */
const AVG_PHOTO_KB = 16;

/** Credit line for the bundled food photos plus a one-tap "store all of them for offline use". */
export function FoodPhotosOffline({ stems }: { stems: readonly string[] }) {
  const [stored, setStored] = useState<number | null>(null);
  const [progress, setProgress] = useState<FoodPhotoProgress | null>(null);
  const [result, setResult] = useState<FoodPhotoProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  const total = stems.length;
  const key = stems.join(',');

  useEffect(() => {
    let live = true;
    void cachedFoodPhotoCount(key.split(',')).then((n) => live && setStored(n));
    return () => {
      live = false;
    };
  }, [key]);
  // Leaving the screen stops a running download (the photos stored so far stay).
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    abort.current = new AbortController();
    setResult(null);
    const r = await downloadFoodPhotos(stems, setProgress, abort.current.signal);
    abort.current = null;
    setProgress(null);
    // A stopped run shows "N of M stored" instead of a result line.
    setResult(r.done < r.total ? null : r);
    setStored(await cachedFoodPhotoCount(stems));
  };

  const running = progress !== null;
  const ready = stored !== null && stored >= total;
  return (
    <section className={styles.box} aria-label={t('nutrition.foodPhotos.offlineTitle')} data-testid="food-photos-offline">
      <h2 className={styles.title}><TitleIcon name="download" />{t('nutrition.foodPhotos.offlineTitle')}</h2>
      <p className={styles.body}>
        {ready
          ? t('nutrition.foodPhotos.offlineReady', { n: total })
          : t('nutrition.foodPhotos.offlineBody', { mb: Math.max(1, Math.round((total * AVG_PHOTO_KB) / 1024)) })}
      </p>
      {!ready && stored !== null && stored > 0 && !running && <p className={styles.body}>{t('nutrition.foodPhotos.offlineSome', { done: stored, total })}</p>}
      {running && (
        <p className={styles.body} aria-live="polite">
          {t('nutrition.foodPhotos.downloading', { done: progress.done, total: progress.total })}
        </p>
      )}
      {result && !running && (result.failed > 0 || ready) && (
        <p className={styles.body} aria-live="polite">
          {result.failed > 0 ? t('nutrition.foodPhotos.failed', { n: result.failed }) : t('nutrition.foodPhotos.done')}
        </p>
      )}
      {!ready &&
        (running ? (
          <Button variant="secondary" icon="close" onClick={() => abort.current?.abort()}>
            {t('nutrition.foodPhotos.cancel')}
          </Button>
        ) : (
          <Button variant="secondary" icon="image" onClick={() => void start()}>
            {t('nutrition.foodPhotos.download')}
          </Button>
        ))}
      <p className={styles.credit}>{t('nutrition.foodPhotos.credit')}</p>
    </section>
  );
}
