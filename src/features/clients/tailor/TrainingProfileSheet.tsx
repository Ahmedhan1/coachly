import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { HOME_EQUIPMENT, JOINT_IDS, type JointId } from '@/domain/exercises/fit';
import {
  trainingEmphasisSchema,
  type Client,
  type TrainingProfile,
} from '@/domain/models';
import { t } from '@/i18n';
import { Button, Chip, Icon, IconButton, SegmentedControl, Select, Sheet, TextField } from '@/ui';
import { equipmentName } from '@/i18n/exerciseNames';
import { useExerciseCatalog } from '@/app/catalog';
import { ExercisePickerSheet } from '@/features/programs/ExercisePickerSheet';
import { exerciseName } from '@/i18n/programNames';
import styles from './Tailor.module.css';

const FORM_ID = 'training-profile-form';
type Place = NonNullable<TrainingProfile['place']> | 'none';
type Level = NonNullable<TrainingProfile['level']> | 'none';
type Emphasis = NonNullable<TrainingProfile['emphasis']> | 'none';
const PER_WEEK = ['none', '1', '2', '3', '4', '5', '6'] as const;
const MINUTES = ['none', '30', '45', '60', '75', '90'] as const;

const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** Edits the client's training profile: place, equipment, level, injuries, focus, frequency and exercise lists. */
export function TrainingProfileSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const catalog = useExerciseCatalog();
  const p = client.trainingProfile ?? {};
  const [place, setPlace] = useState<Place>(p.place ?? 'none');
  const [equipment, setEquipment] = useState<string[]>([...(p.homeEquipment ?? [])]);
  const [level, setLevel] = useState<Level>(p.level ?? 'none');
  const [joints, setJoints] = useState<JointId[]>([...(p.injuredJoints ?? [])]);
  const [injuryNote, setInjuryNote] = useState(p.injuryNote ?? '');
  const [emphasis, setEmphasis] = useState<Emphasis>(p.emphasis ?? 'none');
  const [perWeek, setPerWeek] = useState<(typeof PER_WEEK)[number]>(p.sessionsPerWeek ? (String(Math.min(6, p.sessionsPerWeek)) as (typeof PER_WEEK)[number]) : 'none');
  const [minutes, setMinutes] = useState<string>(p.sessionMinutes ? String(p.sessionMinutes) : 'none');
  const [avoid, setAvoid] = useState<string[]>([...(p.avoidIds ?? [])]);
  const [fav, setFav] = useState<string[]>([...(p.favouriteIds ?? [])]);
  const [picking, setPicking] = useState<null | 'avoid' | 'fav'>(null);
  const name = (id: string) => exerciseName(catalog?.byId.get(id), id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: TrainingProfile = {
      ...(place !== 'none' ? { place } : {}),
      ...(place === 'home' || place === 'both' ? { homeEquipment: equipment } : {}),
      ...(level !== 'none' ? { level } : {}),
      injuredJoints: joints,
      ...(injuryNote.trim() ? { injuryNote: injuryNote.trim() } : {}),
      ...(emphasis !== 'none' ? { emphasis } : {}),
      ...(perWeek !== 'none' ? { sessionsPerWeek: Number(perWeek) } : {}),
      ...(minutes !== 'none' ? { sessionMinutes: Number(minutes) } : {}),
      avoidIds: avoid,
      favouriteIds: fav,
    };
    await repos.clients.update(client.id, { trainingProfile: next });
    showToast({ message: t('hub.tailor.saved', { name: client.name }), duration: 2500 });
    onClose();
  };

  const notSet = t('hub.tailor.notSet');
  const minuteOptions = MINUTES.includes(minutes as (typeof MINUTES)[number]) ? MINUTES : ([...MINUTES, minutes] as const);

  const exerciseList = (ids: string[], set: (ids: string[]) => void, label: string, add: string, kind: 'avoid' | 'fav') => (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      {ids.length === 0 ? (
        <p className={styles.empty}>{t('hub.tailor.listEmpty')}</p>
      ) : (
        <ul className={styles.list}>
          {ids.map((id) => (
            <li key={id} className={styles.listRow}>
              <span className={styles.listName}>{name(id)}</span>
              <IconButton icon="close" label={t('hub.tailor.remove', { name: name(id) })} onClick={() => set(ids.filter((x) => x !== id))} />
            </li>
          ))}
        </ul>
      )}
      <div className={styles.chips}>
        <Chip disabled={!catalog} onClick={() => setPicking(kind)}>
          <Icon name="plus" />
          {add}
        </Chip>
      </div>
    </fieldset>
  );

  return (
    <>
      <Sheet
        open={picking === null}
        onClose={onClose}
        title={t('hub.tailor.sheetTitle', { name: client.name })}
        cancelLabel={t('common.cancel')}
        primaryAction={
          <Button size="small" type="submit" form={FORM_ID}>
            {t('common.save')}
          </Button>
        }
      >
        <form id={FORM_ID} className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
          <SegmentedControl
            label={t('hub.tailor.place.label')}
            value={place}
            onChange={setPlace}
            options={[
              { value: 'gym', label: t('hub.tailor.place.gym') },
              { value: 'home', label: t('hub.tailor.place.home') },
              { value: 'both', label: t('hub.tailor.place.both') },
              { value: 'none', label: notSet },
            ]}
          />
          {(place === 'home' || place === 'both') && (
            <fieldset className={styles.group}>
              <legend className={styles.legend}>{t('hub.tailor.equipment.label')}</legend>
              <div className={styles.chips}>
                {HOME_EQUIPMENT.map((id) => (
                  <Chip key={id} pressed={equipment.includes(id)} onClick={() => setEquipment((cur) => toggle(cur, id))}>
                    {equipmentName(id)}
                  </Chip>
                ))}
              </div>
              <p className={styles.hint}>{t('hub.tailor.equipment.hint')}</p>
            </fieldset>
          )}
          <SegmentedControl
            label={t('hub.tailor.level.label')}
            value={level}
            onChange={setLevel}
            options={[
              { value: 'beginner', label: t('hub.tailor.level.beginner') },
              { value: 'intermediate', label: t('hub.tailor.level.intermediate') },
              { value: 'advanced', label: t('hub.tailor.level.advanced') },
              { value: 'none', label: notSet },
            ]}
          />
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{t('hub.tailor.joints.label')}</legend>
            <div className={styles.chips}>
              {JOINT_IDS.map((j) => (
                <Chip key={j} tone="warn" pressed={joints.includes(j)} onClick={() => setJoints((cur) => toggle(cur, j))}>
                  {t(`hub.tailor.joints.${j}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <TextField label={t('hub.tailor.injuryNote')} value={injuryNote} maxLength={200} onChange={(e) => setInjuryNote(e.target.value)} />
          <Select
            label={t('hub.tailor.emphasis.label')}
            value={emphasis}
            onChange={setEmphasis}
            options={[{ value: 'none' as const, label: notSet }, ...trainingEmphasisSchema.options.map((v) => ({ value: v, label: t(`hub.tailor.emphasis.${v}`) }))]}
          />
          <SegmentedControl
            label={t('hub.tailor.sessionsPerWeek')}
            value={perWeek}
            onChange={setPerWeek}
            wrap
            options={PER_WEEK.map((v) => ({ value: v, label: v === 'none' ? notSet : v }))}
          />
          <SegmentedControl
            label={t('hub.tailor.sessionMinutes')}
            value={minutes}
            onChange={setMinutes}
            wrap
            options={minuteOptions.map((v) => ({ value: v, label: v === 'none' ? notSet : t('hub.tailor.minutes', { n: v }) }))}
          />
          {exerciseList(fav, setFav, t('hub.tailor.favList'), t('hub.tailor.addFav'), 'fav')}
          {exerciseList(avoid, setAvoid, t('hub.tailor.avoidList'), t('hub.tailor.addAvoid'), 'avoid')}
        </form>
      </Sheet>
      {catalog && picking !== null && (
        <ExercisePickerSheet
          open
          onClose={() => setPicking(null)}
          onPick={(e) => {
            if (picking === 'avoid') {
              setAvoid((cur) => (cur.includes(e.id) ? cur : [...cur, e.id]));
              setFav((cur) => cur.filter((x) => x !== e.id));
            } else {
              setFav((cur) => (cur.includes(e.id) ? cur : [...cur, e.id]));
              setAvoid((cur) => cur.filter((x) => x !== e.id));
            }
            setPicking(null);
          }}
          exercises={catalog.list}
          favourites={catalog.favourites}
          title={picking === 'avoid' ? t('hub.tailor.addAvoid') : t('hub.tailor.addFav')}
        />
      )}
    </>
  );
}
