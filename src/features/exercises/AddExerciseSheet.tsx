import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import {
  EQUIPMENT_IDS,
  EQUIPMENT_LABELS_AR,
  LEVEL_IDS,
  LEVEL_LABELS_AR,
  MUSCLE_GROUPS,
  type EquipmentId,
  type ExerciseLevel,
  type MuscleGroupId,
} from '@/domain/exercises';
import { t } from '@/i18n';
import { Icon, SegmentedControl, Select, Sheet, TextField } from '@/ui';
import { ChipGroup, ChipToggle } from './ChipToggle';
import { toggleIn } from './libraryUi';
import { useLibraryStore } from './useCatalog';
import { MAX_PHOTOS, usePhotoDrafts } from './usePhotoDrafts';
import styles from './Sheets.module.css';

const FORM_ID = 'add-exercise-form';
const NAME_ID = 'add-exercise-name';
const EQUIPMENT = EQUIPMENT_IDS.map((value) => ({ value, label: EQUIPMENT_LABELS_AR[value] }));
const LEVELS = LEVEL_IDS.map((value) => ({ value, label: LEVEL_LABELS_AR[value] }));

/** Trainer's own exercise: name, muscles, equipment, level and up to two photos. */
export function AddExerciseSheet({ onClose, initialMuscle }: { onClose: () => void; initialMuscle?: MuscleGroupId }) {
  const store = useLibraryStore();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const photos = usePhotoDrafts();
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<MuscleGroupId[]>(initialMuscle ? [initialMuscle] : []);
  const [secondary, setSecondary] = useState<MuscleGroupId[]>([]);
  const [equipment, setEquipment] = useState<EquipmentId>('body_only');
  const [level, setLevel] = useState<ExerciseLevel>('beginner');
  const [errors, setErrors] = useState<{ name?: string; muscles?: string; save?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : t('training.library.add.nameRequired'),
      muscles: primary.length > 0 ? undefined : t('training.library.add.primaryRequired'),
    };
    setErrors(next);
    if (next.name || next.muscles) return;
    setSaving(true);
    try {
      const imageIds = await photos.save(photos.drafts);
      const id = await store.createCustom({ nameAr: name, primaryMuscles: primary, secondaryMuscles: secondary, equipment, level, imageIds });
      onClose();
      showToast({ message: t('training.library.add.saved', { name: name.trim() }) });
      navigate(`/exercises/${encodeURIComponent(id)}`);
    } catch {
      setSaving(false);
      setErrors({ save: t('training.library.add.failed') });
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('training.library.add.title')}
      cancelLabel={t('common.cancel')}
      initialFocusId={NAME_ID}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save} disabled={saving}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          id={NAME_ID}
          label={t('training.library.add.name')}
          placeholder={t('training.library.add.namePlaceholder')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
          error={errors.name}
          autoComplete="off"
          enterKeyHint="done"
          required
        />
        <ChipGroup label={t('training.library.add.primary')}>
          {MUSCLE_GROUPS.map((g) => (
            <ChipToggle
              key={g.id}
              pressed={primary.includes(g.id)}
              onToggle={() => {
                setPrimary(toggleIn(primary, g.id));
                setSecondary((s) => s.filter((m) => m !== g.id));
                setErrors((x) => ({ ...x, muscles: undefined }));
              }}
            >
              {g.labelAr}
            </ChipToggle>
          ))}
        </ChipGroup>
        {errors.muscles && (
          <p className={styles.error} role="alert">
            {errors.muscles}
          </p>
        )}
        <ChipGroup label={`${t('training.library.add.secondary')} (${t('common.optional')})`}>
          {MUSCLE_GROUPS.filter((g) => !primary.includes(g.id)).map((g) => (
            <ChipToggle key={g.id} pressed={secondary.includes(g.id)} onToggle={() => setSecondary(toggleIn(secondary, g.id))}>
              {g.labelAr}
            </ChipToggle>
          ))}
        </ChipGroup>
        <Select label={t('training.library.add.equipment')} options={EQUIPMENT} value={equipment} onChange={setEquipment} />
        <SegmentedControl label={t('training.library.add.level')} options={LEVELS} value={level} onChange={setLevel} />
        <ChipGroup label={`${t('training.library.add.photos')} (${t('common.optional')})`}>
          <div className={styles.photos}>
            {photos.drafts.map((p, i) => (
              <div key={p.key} className={styles.photo}>
                <img src={p.url} alt={t('training.library.add.photoAlt', { n: i + 1 })} />
                <button
                  type="button"
                  className={styles.removePhoto}
                  aria-label={t('training.library.add.removePhoto', { n: i + 1 })}
                  onClick={() => photos.remove(p.key)}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
            {photos.drafts.length < MAX_PHOTOS && (
              <label className={styles.addPhoto}>
                <Icon name="image" />
                {t('training.library.add.addPhoto')}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="visually-hidden"
                  onChange={(e) => {
                    void photos.add(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </ChipGroup>
        {photos.failed && <p className={styles.error}>{t('training.library.detail.photoFailed')}</p>}
        {errors.save && (
          <p className={styles.error} role="alert">
            {errors.save}
          </p>
        )}
      </form>
    </Sheet>
  );
}
