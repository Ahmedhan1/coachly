import { useState, type FormEvent } from 'react';
import { getLocale, t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui';
import styles from './Sheets.module.css';

const FORM_ID = 'rename-exercise-form';
const NAME_ID = 'rename-exercise-name';
const OTHER_ID = 'rename-exercise-other';

/** What changed; an absent field was not touched. An empty `nameEn` clears the trainer's English name. */
export interface RenameResult {
  nameAr?: string;
  nameEn?: string;
}

/**
 * The trainer's names for an exercise. The first field is the name in the app language, pre-filled with the
 * name shown; the second is the other language. Only changed names are saved, so renaming in English never
 * touches the Arabic name. Built-ins can go back to their default names.
 */
export function RenameSheet({
  currentAr,
  shownEn,
  trainerEn,
  defaultNameAr,
  defaultNameEn,
  onSave,
  onClose,
}: {
  /** The Arabic name (the trainer's rename when there is one). */
  currentAr: string;
  /** The name shown in English right now. */
  shownEn: string;
  /** The English name the trainer typed, '' when none. */
  trainerEn: string;
  /** Built-in default names; null for custom exercises. */
  defaultNameAr: string | null;
  defaultNameEn: string | null;
  onSave: (result: RenameResult) => Promise<void>;
  onClose: () => void;
}) {
  const english = getLocale() === 'en';
  const initialEn = english ? shownEn : trainerEn;
  const [nameAr, setNameAr] = useState(currentAr);
  const [nameEn, setNameEn] = useState(initialEn);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim() && defaultNameAr === null) {
      setError(t('training.library.add.nameRequired'));
      return;
    }
    const result: RenameResult = {};
    if (nameAr.trim() !== currentAr.trim()) result.nameAr = nameAr;
    if (nameEn.trim() !== initialEn.trim()) result.nameEn = nameEn;
    await onSave(result);
  };

  const arField = (
    <TextField
      key="ar"
      id={english ? OTHER_ID : NAME_ID}
      label={english ? t('exercises.names.nameAr') : t('training.library.detail.renameLabel')}
      value={nameAr}
      dir="rtl"
      lang="ar"
      onChange={(e) => {
        setNameAr(e.target.value);
        setError(null);
      }}
      hint={defaultNameAr && defaultNameAr !== nameAr.trim() ? t('training.library.detail.renameHint', { name: defaultNameAr }) : undefined}
      error={error}
      autoComplete="off"
      enterKeyHint="done"
    />
  );
  const enField = (
    <TextField
      key="en"
      id={english ? NAME_ID : OTHER_ID}
      label={english ? t('training.library.detail.renameLabel') : t('exercises.names.nameEn')}
      value={nameEn}
      ltr
      lang="en"
      placeholder={defaultNameEn ?? undefined}
      onChange={(e) => setNameEn(e.target.value)}
      hint={
        defaultNameEn && defaultNameEn !== nameEn.trim()
          ? t('exercises.names.nameEnDefault', { name: defaultNameEn })
          : t('exercises.names.nameEnHint')
      }
      autoComplete="off"
      enterKeyHint="done"
    />
  );
  const changedFromDefault =
    (defaultNameAr !== null && defaultNameAr !== currentAr) || (defaultNameAr !== null && trainerEn !== '');

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('training.library.detail.renameTitle')}
      cancelLabel={t('common.cancel')}
      initialFocusId={NAME_ID}
      primaryAction={
        <Button size="small" type="submit" form={FORM_ID}>
          {t('common.save')}
        </Button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        {english ? [enField, arField] : [arField, enField]}
        {changedFromDefault && (
          <Button icon="undo" variant="secondary" onClick={() => void onSave({ nameAr: '', nameEn: '' })}>
            {t('training.library.detail.renameReset')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
