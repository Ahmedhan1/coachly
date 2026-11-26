import { useState } from 'react';
import { useUiStore } from '@/app/uiStore';
import type { CatalogExercise } from '@/domain/exercises';
import type { Client } from '@/domain/models';
import { clientNoteText, fitProfileOf, hasTrainingProfile } from '@/domain/programs/tailor';
import { getLocale, t } from '@/i18n';
import { Button, cx, TitleIcon } from '@/ui';
import { exerciseName } from '@/i18n/programNames';
import { ClientNoteSheet } from './ClientNoteSheet';
import { TrainingProfileSheet } from './TrainingProfileSheet';
import { useAutoProgram } from './useAutoProgram';
import styles from './Tailor.module.css';

export interface TrainingProfileCardProps {
  client: Client;
  catalog: { list: readonly CatalogExercise[]; byId: ReadonlyMap<string, CatalogExercise> } | null | undefined;
  hasProgram: boolean;
  onProgramMade: (programId: string) => void;
}

/** «ملف التمرين» on the client's training tab: a short summary, edit, a fitting program, and exercise notes. */
export function TrainingProfileCard({ client, catalog, hasProgram, onProgramMade }: TrainingProfileCardProps) {
  const showToast = useUiStore((s) => s.showToast);
  const makeProgram = useAutoProgram();
  const [sheet, setSheet] = useState<null | 'profile' | { note: string }>(null);
  const [busy, setBusy] = useState(false);
  const p = client.trainingProfile ?? {};
  const joints = fitProfileOf(client).injuredJoints ?? [];
  const has = hasTrainingProfile(client);
  const notes = Object.entries(client.exerciseNotes ?? {});
  const name = (id: string) => exerciseName(catalog?.byId.get(id), id);

  const facts: { text: string; warn?: boolean }[] = [];
  if (p.place) facts.push({ text: t(`hub.tailor.place.${p.place}`) });
  if (p.level) facts.push({ text: t(`hub.tailor.level.${p.level}`) });
  if (p.emphasis) facts.push({ text: t(`hub.tailor.emphasis.${p.emphasis}`) });
  if (p.sessionsPerWeek) facts.push({ text: t('hub.tailor.perWeek', { n: p.sessionsPerWeek }) });
  if (p.sessionMinutes) facts.push({ text: t('hub.tailor.minutes', { n: p.sessionMinutes }) });
  if (joints.length > 0) facts.push({ text: t('hub.tailor.injuries', { list: joints.map((j) => t(`hub.tailor.joints.${j}`)).join(getLocale() === 'en' ? ', ' : '، ') }), warn: true });
  if (p.favouriteIds?.length) facts.push({ text: t('hub.tailor.favCount', { n: p.favouriteIds.length }) });
  if (p.avoidIds?.length) facts.push({ text: t('hub.tailor.avoidCount', { n: p.avoidIds.length }) });

  const onAuto = async () => {
    if (!catalog || busy) return;
    setBusy(true);
    try {
      const program = await makeProgram(client, catalog.list);
      if (!program) return showToast({ message: t('hub.tailor.autoEmpty') });
      showToast({ message: t('hub.tailor.autoDone', { name: program.name }), duration: 2500 });
      onProgramMade(program.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="tailor-card-title" data-testid="training-profile-card">
      <div className={styles.cardHead}>
        <h2 id="tailor-card-title" className={styles.cardTitle}><TitleIcon name="idCard" />
          {t('hub.tailor.card')}
        </h2>
        {has && (
          <Button size="small" variant="plain" icon="edit" onClick={() => setSheet('profile')}>
            {t('hub.tailor.edit')}
          </Button>
        )}
      </div>
      {has ? (
        <ul className={styles.facts} aria-label={t('hub.tailor.card')}>
          {facts.map((f) => (
            <li key={f.text} className={cx(styles.fact, f.warn && styles.warnFact)}>
              {f.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.cardBody}>{t('hub.tailor.cardEmpty', { name: client.name })}</p>
      )}
      <div className={styles.cardActions}>
        {!has && (
          <Button size="small" icon="edit" onClick={() => setSheet('profile')}>
            {t('hub.tailor.setUp')}
          </Button>
        )}
        <Button size="small" variant={has && !hasProgram ? 'primary' : 'secondary'} icon="list" disabled={!catalog || busy} onClick={() => void onAuto()}>
          {t('hub.tailor.autoProgram')}
        </Button>
      </div>
      <p className={styles.hint}>{t('hub.tailor.autoHint')}</p>
      {notes.length > 0 && (
        <>
          <h3 className={styles.legend}>{t('hub.tailor.note.listTitle')}</h3>
          <ul className={styles.notes}>
            {notes.map(([id, entry]) => (
              <li key={id}>
                <button type="button" className={styles.noteRow} onClick={() => setSheet({ note: id })}>
                  <span className={styles.noteName}>{name(id)}</span>
                  <span className={styles.noteText}>{clientNoteText(entry, t('clientDetail.kg'))}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {sheet === 'profile' && <TrainingProfileSheet client={client} onClose={() => setSheet(null)} />}
      {sheet !== null && typeof sheet === 'object' && (
        <ClientNoteSheet client={client} exerciseId={sheet.note} exerciseName={name(sheet.note)} onClose={() => setSheet(null)} />
      )}
    </section>
  );
}
