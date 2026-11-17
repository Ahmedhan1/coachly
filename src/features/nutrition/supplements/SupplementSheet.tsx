import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { ImageId, Supplement } from '@/domain/models';
import { t } from '@/i18n';
import { Sheet, TextArea, TextField } from '@/ui';
import { currencyLabel } from '@/ui/format';
import { moneyInputValue, parseMoneyInput } from '@/features/clients/moneyInput';
import { PhotoField } from '../shared/PhotoField';
import { useNutritionStore } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';

const FORM_ID = 'supplement-form';

/** Add or edit a catalog product. Dose and timing are free text the trainer types — never suggested. */
export function SupplementSheet({ supplement, currency, onClose }: { supplement: Supplement | null; currency: string; onClose: () => void }) {
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState(supplement?.name ?? '');
  const [price, setPrice] = useState(supplement?.priceMinor ? moneyInputValue(supplement.priceMinor) : '');
  const [dose, setDose] = useState(supplement?.dose ?? '');
  const [timing, setTiming] = useState(supplement?.timing ?? '');
  const [notes, setNotes] = useState(supplement?.notes ?? '');
  const [imageId, setImageId] = useState<string | null>(supplement?.imageId ?? null);
  const [error, setError] = useState<string | null>(null);
  const cur = supplement?.currency ?? currency;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('nutrition.supplements.nameRequired'));
    const values = {
      name: name.trim(),
      priceMinor: parseMoneyInput(price),
      currency: cur,
      dose: dose.trim(),
      timing: timing.trim(),
      notes: notes.trim(),
      imageId: imageId as ImageId | null,
    };
    if (supplement) {
      await repos.supplements.update(supplement.id, values);
      await store.adoptStarter(supplement.id);
    } else {
      await repos.supplements.create(values);
    }
    showToast({ message: t('nutrition.supplements.saved'), duration: 2500 });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={supplement ? t('nutrition.supplements.editTitle') : t('nutrition.supplements.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form={FORM_ID} className={common.sheetSave}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={common.form} onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label={t('nutrition.supplements.name')}
          placeholder={t('nutrition.supplements.namePlaceholder')}
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          autoComplete="off"
        />
        <TextField
          label={`${t('nutrition.supplements.price')} (${currencyLabel(cur)}) (${t('common.optional')})`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          ltr
        />
        <p className={common.note}>{t('nutrition.supplements.noDoseNote')}</p>
        <TextField
          label={`${t('nutrition.supplements.dose')} (${t('common.optional')})`}
          placeholder={t('nutrition.supplements.dosePlaceholder')}
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label={`${t('nutrition.supplements.timing')} (${t('common.optional')})`}
          placeholder={t('nutrition.supplements.timingPlaceholder')}
          value={timing}
          onChange={(e) => setTiming(e.target.value)}
          autoComplete="off"
        />
        <TextArea label={`${t('nutrition.supplements.notes')} (${t('common.optional')})`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <PhotoField
          label={t('nutrition.supplements.photo')}
          addLabel={t('nutrition.supplements.addPhoto')}
          removeLabel={t('nutrition.supplements.removePhoto')}
          imageId={imageId}
          onChange={setImageId}
        />
      </form>
    </Sheet>
  );
}
