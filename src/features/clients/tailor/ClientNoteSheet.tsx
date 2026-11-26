import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { Client } from '@/domain/models';
import { setClientExerciseNote } from '@/domain/programs/tailor';
import { t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui';
import { useExerciseCatalog } from '@/app/catalog';
import { exerciseName as programExerciseName } from '@/i18n/programNames';
import styles from './Tailor.module.css';

const FORM_ID = 'client-note-form';

const toNumber = (s: string): number | null => {
  const n = Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫,]/g, '.'));
  return s.trim() && Number.isFinite(n) && n > 0 && n <= 500 ? n : null;
};

export interface ClientNoteSheetProps {
  client: Pick<Client, 'id' | 'name' | 'exerciseNotes'>;
  exerciseId: string;
  /** Shown in the title; looked up in the catalog when not given. */
  exerciseName?: string;
  onClose: () => void;
}

/** The trainer's note on one exercise for this client only: a cue or warning, and an optional weight limit. */
export function ClientNoteSheet({ client, exerciseId, exerciseName, onClose }: ClientNoteSheetProps) {
  const repos = useRepos();
  const catalog = useExerciseCatalog();
  const title = exerciseName ?? programExerciseName(catalog?.byId.get(exerciseId), exerciseId);
  const showToast = useUiStore((s) => s.showToast);
  const current = client.exerciseNotes?.[exerciseId];
  const [note, setNote] = useState(current?.note ?? '');
  const [maxKg, setMaxKg] = useState(current?.maxKg ? String(current.maxKg) : '');

  const save = async (entry: { note: string; maxKg: number | null }) => {
    const fresh = (await repos.clients.get(client.id)) ?? client;
    const exerciseNotes = setClientExerciseNote(fresh.exerciseNotes, exerciseId, entry);
    await repos.clients.update(client.id, { exerciseNotes });
    showToast({ message: entry.note.trim() || entry.maxKg ? t('hub.tailor.note.saved') : t('hub.tailor.note.cleared'), duration: 2000 });
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save({ note, maxKg: toNumber(maxKg) });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${title} · ${t('hub.tailor.note.title', { name: client.name })}`}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" type="submit" form={FORM_ID}>
          {t('common.save')}
        </Button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t('hub.tailor.note.field')}
          hint={t('hub.tailor.note.fieldHint')}
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          data-testid="client-note-field"
        />
        <TextField label={t('hub.tailor.note.maxKg')} inputMode="decimal" value={maxKg} maxLength={6} ltr onChange={(e) => setMaxKg(e.target.value)} />
        {current && (
          <Button variant="danger" size="small" icon="trash" onClick={() => void save({ note: '', maxKg: null })}>
            {t('hub.tailor.note.clear')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
