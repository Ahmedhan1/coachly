import { useId, useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { toIsoDate, type ClientId, type ImageId, type ProgressEntry } from '@/domain/models';
import { t, type TKey } from '@/i18n';
import { Button, Icon, Sheet, TextArea, TextField } from '@/ui';
import { parseDecimal } from '../shared/numbers';
import { storePhoto } from '../shared/photos';
import { StoredImage } from '../shared/StoredImage';
import { useNutritionStore } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';
import styles from './Progress.module.css';

const FIELDS = [
  ['weightKg', 'nutrition.progress.weight'],
  ['bodyFatPercent', 'nutrition.progress.bodyFat'],
  ['waistCm', 'nutrition.progress.waist'],
  ['neckCm', 'nutrition.progress.neck'],
  ['hipCm', 'nutrition.progress.hip'],
  ['chestCm', 'nutrition.progress.chest'],
  ['armCm', 'nutrition.progress.arm'],
  ['thighCm', 'nutrition.progress.thigh'],
] as const satisfies ReadonlyArray<readonly [keyof ProgressEntry['measurements'], TKey]>;

type Key = (typeof FIELDS)[number][0];

/** Add or edit one progress entry: a date, any measurements, notes and up to 12 photos (downscaled). */
export function EntrySheet({ clientId, entry, onClose }: { clientId: string; entry: ProgressEntry | null; onClose: () => void }) {
  const services = useServices();
  const repos = services.data.repos;
  const showToast = useUiStore((s) => s.showToast);
  const fileId = useId();
  const [date, setDate] = useState(entry?.date ?? toIsoDate(new Date()));
  const [values, setValues] = useState<Record<Key, string>>(() => {
    const m = entry?.measurements ?? {};
    return Object.fromEntries(FIELDS.map(([k]) => [k, m[k] !== undefined ? String(m[k]) : ''])) as Record<Key, string>;
  });
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const store = useNutritionStore();
  const [photos, setPhotos] = useState<string[]>(entry?.photoIds ?? []);
  /** Full image id → its small thumbnail, so long lists never decode 1200 px photos. */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const measurements: ProgressEntry['measurements'] = {};
    for (const [k] of FIELDS) {
      const text = values[k].trim();
      if (!text) continue;
      const n = parseDecimal(text);
      if (!Number.isFinite(n) || n <= 0) return setError(t('nutrition.progress.invalid'));
      measurements[k] = n;
    }
    if (Object.keys(measurements).length === 0 && photos.length === 0 && !notes.trim()) return setError(t('nutrition.progress.emptyEntry'));
    const body = { clientId: clientId as ClientId, date, measurements, photoIds: photos as ImageId[], notes: notes.trim(), source: entry?.source ?? ('trainer' as const) };
    try {
      const saved = entry ? await repos.progress.update(entry.id, body) : await repos.progress.create(body);
      const known = new Map((await store.getEntryPhotos(saved.id)).map((p) => [p.imageId, p]));
      const details = photos.flatMap((id) => {
        const thumbId = thumbs[id] ?? known.get(id)?.thumbId;
        return thumbId ? [{ imageId: id, thumbId, pose: known.get(id)?.pose ?? ('front' as const) }] : [];
      });
      await store.setEntryPhotos(saved.id, details).catch(() => undefined);
    } catch {
      return setError(t('nutrition.progress.invalid'));
    }
    showToast({ message: t('nutrition.progress.saved'), duration: 2500 });
    onClose();
  };

  const remove = async () => {
    if (!entry) return;
    await repos.progress.softDelete(entry.id);
    onClose();
    showToast({ message: t('nutrition.progress.deleted'), actionLabel: t('common.undo'), onAction: () => void repos.progress.restore(entry.id) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? t('nutrition.progress.editTitle') : t('nutrition.progress.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form="entry-form" className={common.sheetSave} disabled={busy}>
          {t('common.save')}
        </button>
      }
    >
      <form id="entry-form" className={common.form} onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t('nutrition.progress.date')} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} ltr />
        <div className={common.grid2}>
          {FIELDS.map(([k, label]) => (
            <TextField
              key={k}
              label={t(label)}
              inputMode="decimal"
              value={values[k]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [k]: e.target.value }));
                setError(null);
              }}
              ltr
            />
          ))}
        </div>
        <TextArea label={`${t('nutrition.progress.notes')} (${t('common.optional')})`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className={styles.photoField}>
          <span className={common.caption}>{t('nutrition.progress.photos')}</span>
          <div className={styles.photoRow}>
            {photos.map((id) => (
              <span key={id} className={styles.photoCell}>
                <StoredImage imageId={id} alt="" className={styles.photoThumb} />
                <button type="button" className={styles.photoRemove} aria-label={t('nutrition.progress.removePhoto')} onClick={() => setPhotos((p) => p.filter((x) => x !== id))}>
                  <Icon name="close" />
                </button>
              </span>
            ))}
            {photos.length < 12 && (
              <label className={common.fileButton} htmlFor={fileId} aria-busy={busy}>
                <Icon name="image" />
                {t('nutrition.progress.addPhoto')}
                <input
                  id={fileId}
                  className={styles.fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busy}
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])].slice(0, 12 - photos.length);
                    e.target.value = '';
                    setBusy(true);
                    try {
                      for (const f of files) {
                        const stored = await storePhoto(services, f);
                        setPhotos((p) => [...p, stored.imageId]);
                        setThumbs((m) => ({ ...m, [stored.imageId]: stored.thumbId }));
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
        {error && (
          <p className={common.error} role="alert">
            {error}
          </p>
        )}
        {entry && (
          <Button variant="danger" icon="trash" onClick={() => void remove()}>
            {t('nutrition.progress.delete')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
