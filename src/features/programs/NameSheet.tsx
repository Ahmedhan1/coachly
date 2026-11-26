import { useState } from 'react';
import { t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui';

export interface NameSheetProps {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  required?: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

/** Small sheet with one text field (program / day name). */
export function NameSheet({ open, title, label, initial, required, onClose, onSave }: NameSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" type="submit" form="name-sheet-form">
          {t('common.save')}
        </Button>
      }
    >
      {open && <NameForm key={initial} label={label} initial={initial} required={required} onSave={onSave} />}
    </Sheet>
  );
}

function NameForm({ label, initial, required, onSave }: Pick<NameSheetProps, 'label' | 'initial' | 'required' | 'onSave'>) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      id="name-sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (required && name === '') {
          setError(t('training.programs.menu.nameRequired'));
          return;
        }
        onSave(name);
      }}
    >
      <TextField label={label} value={value} maxLength={120} error={error} onChange={(e) => setValue(e.target.value)} enterKeyHint="done" />
    </form>
  );
}
