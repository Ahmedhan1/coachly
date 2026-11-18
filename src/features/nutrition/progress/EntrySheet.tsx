import { useId, useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { useUiStore } from '@/app/uiStore';
import { toIsoDate, type ClientId, type ImageId, type ProgressEntry } from '@/domain/models';
import { entryNavyEstimate, type EntryNavyEstimate } from '@/domain/nutrition';
import { t, type TKey } from '@/i18n';
import { Button, Icon, Sheet, TextArea, TextField } from '@/ui';
import { formatNumber, LIST_SEP } from '@/ui/format';
import { navyErrorText } from '../shared/errors';
import { parseDecimal } from '../shared/numbers';
import { storePhoto } from '../shared/photos';
import { StoredImage } from '../shared/StoredImage';
import { useClient } from '../shared/useClient';
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

/** Typed numbers only (bad or empty boxes are left out), for the live Navy estimate. */
function typedNumbers(values: Record<Key, string>): ProgressEntry['measurements'] {
  const out: ProgressEntry['measurements'] = {};
  for (const [k] of FIELDS) {
    const text = values[k].trim();
    const n = text ? parseDecimal(text) : NaN;
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** What the trainer sees under the boxes about the Navy body-fat estimate. */
function NavyNote({ estimate }: { estimate: EntryNavyEstimate }) {
  if (estimate.status === 'none') return null;
  if (estimate.status === 'invalid') return <p className={common.caption}>{navyErrorText(estimate.error)}</p>;
  if (estimate.status === 'needs')
    return <p className={common.caption}>{t('nutrition.progress.navyNeeds', { list: estimate.missing.map((m) => t(`nutrition.progress.navyMissing.${m}`)).join(LIST_SEP) })}</p>;
  return (
    <div className={styles.navyNote} role="status" data-testid="navy-estimate">
      <strong>{t('nutrition.progress.navyEstimate', { n: formatNumber(estimate.bodyFatPercent) })}</strong>
      <span className={common.caption}>{t('nutrition.progress.navyAuto')}</span>
    </div>
  );
}

/** Add or edit one progress entry: a date, any measurements, notes and up to 12 photos (downscaled). */
export function EntrySheet({ clientId, entry, onClose }: { clientId: string; entry: ProgressEntry | null; onClose: () => void }) {
  const services = useServices();
  const repos = services.data.repos;
  const showToast = useUiStore((s) => s.showToast);
  const fileId = useId();
  const client = useClient(clientId);
  const store = useNutritionStore();
  const nutrition = useLive(() => store.getSettings(), [store]);
  const [date, setDate] = useState(entry?.date ?? toIsoDate(new Date()));
  const [values, setValues] = useState<Record<Key, string>>(() => {
    const m = entry?.measurements ?? {};
    // An earlier Navy estimate is not shown as typed: it is worked out again from the boxes.
    const shown = (k: Key) => m[k] !== undefined && !(k === 'bodyFatPercent' && entry?.bodyFatSource === 'navy');
    return Object.fromEntries(FIELDS.map(([k]) => [k, shown(k) ? String(m[k]) : ''])) as Record<Key, string>;
  });
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [photos, setPhotos] = useState<string[]>(entry?.photoIds ?? []);
  /** Full image id → its small thumbnail, so long lists never decode 1200 px photos. */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navyOf = (m: ProgressEntry['measurements']) =>
    entryNavyEstimate(m, { sex: client?.gender ?? null, heightCm: client?.measurements.heightCm }, nutrition?.navy, nutrition?.limits);
  const estimate = navyOf(typedNumbers(values));

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
    const navy = navyOf(measurements);
    if (navy.status === 'estimated') measurements.bodyFatPercent = navy.bodyFatPercent;
    const body = {
      clientId: clientId as ClientId,
      date,
      measurements,
      photoIds: photos as ImageId[],
      notes: notes.trim(),
      source: entry?.source ?? ('trainer' as const),
      bodyFatSource: navy.status === 'estimated' ? ('navy' as const) : undefined,
    };
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
        <NavyNote estimate={estimate} />
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
