import { useState, type FormEvent } from 'react';
import { t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui';
import styles from './Sheets.module.css';

const FORM_ID = 'rename-exercise-form';
const NAME_ID = 'rename-exercise-name';

/** The trainer's Arabic name override. Built-ins can go back to the default name. */
export function RenameSheet({
  current,
  defaultName,
  onSave,
  onClose,
}: {
  current: string;
  defaultName: string | null;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() && defaultName === null) {
      setError(t('training.library.add.nameRequired'));
      return;
    }
    await onSave(name);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('training.library.detail.renameTitle')}
      cancelLabel={t('common.cancel')}
      initialFocusId={NAME_ID}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          id={NAME_ID}
          label={t('training.library.detail.renameLabel')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          hint={defaultName && defaultName !== name.trim() ? t('training.library.detail.renameHint', { name: defaultName }) : undefined}
          error={error}
          autoComplete="off"
          enterKeyHint="done"
        />
        {defaultName && defaultName !== current && (
          <Button variant="secondary" onClick={() => void onSave('')}>
            {t('training.library.detail.renameReset')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
