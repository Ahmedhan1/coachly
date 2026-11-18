import { useState, type FormEvent } from 'react';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { dietSettingsSchema, type DietSettings } from '@/domain/meals';
import { t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui';
import { fieldText, parseDecimal } from '../shared/numbers';
import { useNutritionStore } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';

const FIELDS = [
  'highProteinPerKg',
  'lowCarbPercent',
  'kcalTolerancePercent',
  'macroTolerancePercent',
  'minServings',
  'maxServings',
  'servingStep',
  'minKcalFemale',
  'minKcalMale',
  'minProteinPerKg',
  'minFatPerKg',
] as const;
/** Calorie-control coefficients (labels under nutrition.cal.s). */
const CAL_FIELDS = [
  'cutMinProteinPerKg',
  'maxProteinPerKg',
  'maxFatPercent',
  'cutRateMinPercent',
  'cutRateMaxPercent',
  'bulkRateMinPercent',
  'bulkRateMaxPercent',
  'maintainBandPercent',
  'kcalPerKgChange',
  'trainingDayExtraKcal',
] as const;
const ALL_FIELDS = [...FIELDS, ...CAL_FIELDS] as const;
type NumericKey = (typeof ALL_FIELDS)[number];
const labelOf = (k: NumericKey) => ((CAL_FIELDS as readonly string[]).includes(k) ? t(`nutrition.cal.s.${k as (typeof CAL_FIELDS)[number]}`) : t(`nutrition.diet.s.${k as (typeof FIELDS)[number]}`));

/** The planner's coefficients (high-protein level, low-carb share, tolerances, serving limits, safety floors). */
export function DietSettingsSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const current = useLive(() => store.getDietSettings(), [store]);
  if (!current) return null;
  return <Form current={current} onClose={onClose} onSaved={onSaved} store={store} showToast={showToast} />;
}

interface FormProps {
  current: DietSettings;
  onClose: () => void;
  onSaved: () => void;
  store: ReturnType<typeof useNutritionStore>;
  showToast: ReturnType<typeof useUiStore.getState>['showToast'];
}

function Form({ current, onClose, onSaved, store, showToast }: FormProps) {
  const [values, setValues] = useState<Record<NumericKey, string>>(() => Object.fromEntries(ALL_FIELDS.map((k) => [k, fieldText(current[k])])) as Record<NumericKey, string>);
  const [error, setError] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = { ...current, ...Object.fromEntries(ALL_FIELDS.map((k) => [k, parseDecimal(values[k])])) };
    const parsed = dietSettingsSchema.safeParse(next);
    if (!parsed.success || parsed.data.minServings > parsed.data.maxServings || parsed.data.cutRateMinPercent > parsed.data.cutRateMaxPercent || parsed.data.bulkRateMinPercent > parsed.data.bulkRateMaxPercent) return setError(true);
    await store.saveDietSettings(parsed.data);
    showToast({ message: t('nutrition.diet.settingsSaved'), duration: 2000 });
    onSaved();
    onClose();
  };
  const reset = async () => {
    await store.resetDietSettings();
    onSaved();
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('nutrition.diet.settingsTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form="diet-settings-form" className={common.sheetSave}>
          {t('common.save')}
        </button>
      }
    >
      <form id="diet-settings-form" className={common.form} onSubmit={(e) => void submit(e)} noValidate>
        <p className={common.muted}>{t('nutrition.diet.settingsHint')}</p>
        <div className={common.grid2}>
          {ALL_FIELDS.map((k) => (
            <TextField key={k} label={labelOf(k)} inputMode="decimal" value={values[k]} onChange={(e) => (setValues({ ...values, [k]: e.target.value }), setError(false))} ltr />
          ))}
        </div>
        {error && (
          <p className={common.error} role="alert">
            {t('nutrition.foods.invalid')}
          </p>
        )}
        <Button variant="plain" onClick={() => void reset()}>
          {t('nutrition.diet.settingsReset')}
        </Button>
      </form>
    </Sheet>
  );
}
