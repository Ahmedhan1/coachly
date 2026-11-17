import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import {
  CATEGORY_LABELS_AR,
  EQUIPMENT_LABELS_AR,
  LEVEL_LABELS_AR,
  muscleGroupLabelAr,
  illustrationSpec,
  type CatalogExercise,
  type MuscleGroupId,
} from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, ListRow, ListSection, PageHeader, cx } from '@/ui';
import { MuscleMap } from '@/ui/MuscleMap';
import { alternativesFor } from '@/domain/exercises';
import { ExerciseThumb } from './ExerciseThumb';
import { useExerciseClients } from './useExerciseClients';
import { StarIcon } from './icons';
import { PhotoCarousel } from './PhotoCarousel';
import { RenameSheet } from './RenameSheet';
import { useCatalog, type CatalogState } from './useCatalog';
import { useFavouriteToggle } from './useFavouriteToggle';
import { usePhotoDrafts } from './usePhotoDrafts';
import styles from './ExerciseDetail.module.css';

const BACK = { to: '/exercises', label: t('training.library.detail.back') };

export function ExerciseDetailScreen() {
  const { exerciseId = '' } = useParams();
  const catalog = useCatalog();
  const exercise = catalog.byId.get(exerciseId);
  if (catalog.status === 'loading') return <PageHeader title="" back={BACK} />;
  if (!exercise) {
    return (
      <>
        <PageHeader title="" back={BACK} />
        <EmptyState icon="dumbbell" title={t('training.library.detail.notFoundTitle')} body={t('training.library.detail.notFoundBody')} />
      </>
    );
  }
  return <ExerciseDetail exercise={exercise} catalog={catalog} />;
}

function MuscleNames({ ids }: { ids: readonly MuscleGroupId[] }) {
  if (ids.length === 0) return <>{t('training.library.detail.none')}</>;
  return <>{ids.map(muscleGroupLabelAr).join('، ')}</>;
}

function ExerciseDetail({ exercise, catalog }: { exercise: CatalogExercise; catalog: CatalogState }) {
  const navigate = useNavigate();
  const { data } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const photos = usePhotoDrafts();
  const [renaming, setRenaming] = useState(false);
  const { store, changes } = catalog;
  const ref = exercise.isCustom ? null : catalog.builtinRef(exercise.id);
  const favourite = changes.favourites.has(exercise.id);
  const hidden = changes.hidden.has(exercise.id);
  const hasOwnPhotos = !exercise.isCustom && exercise.images.some((i) => i.kind === 'stored');
  const toggleFavourite = useFavouriteToggle(catalog);
  const alternatives = useMemo(() => alternativesFor(exercise, catalog.visible, { limit: 6 }), [exercise, catalog.visible]);
  const intensities = useMemo(() => illustrationSpec(exercise).intensities, [exercise]);
  const usedBy = useExerciseClients(exercise.id);

  const replacePhotos = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    try {
      const ids = await photos.storeFiles(list);
      await store.setPhotos(exercise.id, ref, ids);
      showToast({ message: t('training.library.detail.photoSaved') });
    } catch {
      showToast({ message: t('training.library.detail.photoFailed') });
    }
  };

  const hide = async () => {
    await store.setHidden(exercise.id, true);
    showToast({
      message: t('training.library.detail.hiddenToast'),
      actionLabel: t('common.undo'),
      onAction: () => void store.setHidden(exercise.id, false),
    });
    navigate('/exercises', { replace: true });
  };
  const unhide = async () => {
    await store.setHidden(exercise.id, false);
    showToast({ message: t('training.library.detail.unhiddenToast') });
  };
  const remove = async () => {
    await store.deleteCustom(exercise.id);
    showToast({
      message: t('training.library.detail.deleted'),
      actionLabel: t('common.undo'),
      onAction: () => void data.undoLastDelete(),
    });
    navigate('/exercises', { replace: true });
  };

  return (
    <>
      <PageHeader
        title=""
        back={BACK}
        actions={
          <button
            type="button"
            className={cx(styles.round, favourite && styles.starOn)}
            aria-pressed={favourite}
            aria-label={t(favourite ? 'training.library.favouriteRemove' : 'training.library.favouriteAdd', { name: exercise.nameAr })}
            onClick={() => toggleFavourite(exercise)}
          >
            <StarIcon filled={favourite} />
          </button>
        }
      />
      <PhotoCarousel exercise={exercise} />
      <header className={styles.head}>
        <h1 className={styles.name}>{exercise.nameAr}</h1>
        {exercise.nameEn && exercise.nameEn !== exercise.nameAr && (
          <p className={styles.en} dir="ltr" lang="en">
            {exercise.nameEn}
          </p>
        )}
        <div className={styles.tags}>
          {exercise.primaryMuscles.map((m) => (
            <span key={m} className={cx(styles.tag, styles.tagBrand)}>
              {muscleGroupLabelAr(m)}
            </span>
          ))}
          <span className={styles.tag}>{EQUIPMENT_LABELS_AR[exercise.equipment]}</span>
          <span className={styles.tag}>{LEVEL_LABELS_AR[exercise.level]}</span>
          {exercise.isCustom && <span className={styles.tag}>{t('training.library.custom')}</span>}
          {hidden && <span className={styles.tag}>{t('training.library.hidden')}</span>}
        </div>
      </header>

      {exercise.cues !== undefined && exercise.cues.length > 0 && (
        <ListSection title={t('exercises.detail.cues')}>
          <ol className={styles.cues}>
            {exercise.cues.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ol>
        </ListSection>
      )}

      <ListSection title={t('training.library.detail.muscles')} footer={t('exercises.detail.illustrationLegend')}>
        <div className={styles.mapTile}>
          <MuscleMap view="both" size={200} intensities={intensities} captions />
          <dl className={styles.facts}>
            <div>
              <dt>{t('training.library.detail.primary')}</dt>
              <dd>
                <MuscleNames ids={exercise.primaryMuscles} />
              </dd>
            </div>
            <div>
              <dt>{t('training.library.detail.secondary')}</dt>
              <dd>
                <MuscleNames ids={exercise.secondaryMuscles} />
              </dd>
            </div>
            <div>
              <dt>{t('training.library.detail.equipment')}</dt>
              <dd>{EQUIPMENT_LABELS_AR[exercise.equipment]}</dd>
            </div>
            <div>
              <dt>{t('training.library.detail.level')}</dt>
              <dd>{LEVEL_LABELS_AR[exercise.level]}</dd>
            </div>
            <div>
              <dt>{t('training.library.detail.category')}</dt>
              <dd>{CATEGORY_LABELS_AR[exercise.category]}</dd>
            </div>
          </dl>
        </div>
      </ListSection>

      {usedBy !== undefined && usedBy.length > 0 && (
        <ListSection title={t('exercises.detail.clients')} footer={t('exercises.detail.clientsHint')}>
          {usedBy.map((use) => (
            <ListRow
              key={use.clientId}
              title={use.clientName}
              subtitle={t('exercises.detail.clientsPrograms', { programs: use.programNames.join('، ') })}
              to={`/clients/${encodeURIComponent(use.clientId)}`}
            />
          ))}
        </ListSection>
      )}

      {alternatives.length > 0 && (
        <ListSection title={t('training.library.detail.alternatives')} footer={t('training.library.detail.alternativesHint')}>
          {alternatives.map((alt) => (
            <ListRow
              key={alt.id}
              leading={<ExerciseThumb exercise={alt} />}
              title={alt.nameAr}
              subtitle={EQUIPMENT_LABELS_AR[alt.equipment]}
              to={`/exercises/${encodeURIComponent(alt.id)}`}
            />
          ))}
        </ListSection>
      )}

      <ListSection title={t('training.library.detail.actions')}>
        <ListRow leading={<Icon name="edit" />} title={t('training.library.detail.rename')} onClick={() => setRenaming(true)} />
        <label className={styles.fileRow}>
          <Icon name="image" />
          <span className={styles.fileText}>
            <span className={styles.fileTitle}>{t('training.library.detail.replacePhoto')}</span>
            <span className={styles.fileSub}>{t('training.library.detail.replacePhotoHint')}</span>
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            aria-label={t('training.library.detail.replacePhoto')}
            onChange={(e) => {
              void replacePhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {hasOwnPhotos && (
          <ListRow
            leading={<Icon name="undo" />}
            title={t('training.library.detail.restorePhotos')}
            onClick={() =>
              void store.setPhotos(exercise.id, ref, []).then(() => showToast({ message: t('training.library.detail.photosRestored') }))
            }
          />
        )}
      </ListSection>

      <div className={styles.danger}>
        {exercise.isCustom ? (
          <Button variant="danger" icon="trash" onClick={() => void remove()}>
            {t('training.library.detail.delete')}
          </Button>
        ) : hidden ? (
          <Button variant="secondary" icon="undo" onClick={() => void unhide()}>
            {t('training.library.detail.unhide')}
          </Button>
        ) : (
          <Button variant="danger" icon="close" onClick={() => void hide()}>
            {t('training.library.detail.hide')}
          </Button>
        )}
      </div>

      {renaming && (
        <RenameSheet
          current={exercise.nameAr}
          defaultName={ref?.defaultNameAr ?? null}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            await store.rename(exercise.id, ref, name);
            setRenaming(false);
            showToast({ message: t('training.library.detail.renamed') });
          }}
        />
      )}
    </>
  );
}
