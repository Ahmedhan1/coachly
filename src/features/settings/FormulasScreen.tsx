import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { NutritionStore } from '@/data/nutritionStore';
import { nutritionSettingsSchema, type NutritionSettings } from '@/domain/meals';
import { t, type TKey } from '@/i18n';
import { Button, PageHeader, Select, TextField } from '@/ui';
import { parseDecimal } from '@/features/nutrition/shared/numbers';
import styles from './Settings.module.css';

type Path = readonly string[];
interface Field {
  path: Path;
  label: TKey;
}
interface Group {
  title: TKey;
  fields: Field[];
}

const f = (label: TKey, ...path: string[]): Field => ({ path, label });
const GROUPS: Group[] = [
  {
    title: 'settings.formulas.groups.mifflin',
    fields: [
      f('settings.formulas.fields.perKg', 'mifflin', 'perKg'),
      f('settings.formulas.fields.perCm', 'mifflin', 'perCm'),
      f('settings.formulas.fields.perYear', 'mifflin', 'perYear'),
      f('settings.formulas.fields.maleConstant', 'mifflin', 'maleConstant'),
      f('settings.formulas.fields.femaleConstant', 'mifflin', 'femaleConstant'),
    ],
  },
  { title: 'settings.formulas.groups.katch', fields: [f('settings.formulas.fields.base', 'katchMcArdle', 'base'), f('settings.formulas.fields.perKgLbm', 'katchMcArdle', 'perKgLbm')] },
  {
    title: 'settings.formulas.groups.activity',
    fields: (['sedentary', 'light', 'moderate', 'high', 'veryHigh'] as const).map((k) => f(`nutrition.activity.${k}`, 'activityFactors', k)),
  },
  { title: 'settings.formulas.groups.goals', fields: [f('settings.formulas.fields.cut', 'defaultGoalPercent', 'cut'), f('settings.formulas.fields.bulk', 'defaultGoalPercent', 'bulk')] },
  {
    title: 'settings.formulas.groups.macros',
    fields: [
      f('settings.formulas.fields.protein', 'defaultProteinPerKg'),
      f('settings.formulas.fields.fat', 'defaultFatPerKg'),
      f('settings.formulas.fields.kcalProtein', 'kcalPerGram', 'protein'),
      f('settings.formulas.fields.kcalCarb', 'kcalPerGram', 'carb'),
      f('settings.formulas.fields.kcalFat', 'kcalPerGram', 'fat'),
    ],
  },
  { title: 'settings.formulas.groups.water', fields: [f('settings.formulas.fields.min', 'waterMlPerKg', 'min'), f('settings.formulas.fields.max', 'waterMlPerKg', 'max')] },
  { title: 'settings.formulas.groups.plan', fields: [f('settings.formulas.fields.tolerance', 'targetTolerancePercent')] },
];

function getAt(o: unknown, path: Path): number {
  let node: unknown = o;
  for (const p of path) node = (node as Record<string, unknown>)[p];
  return typeof node === 'number' ? node : Number.NaN;
}

function setAt<T>(o: T, path: Path, value: number): T {
  const [head, ...rest] = path;
  if (head === undefined) return o;
  const obj = o as Record<string, unknown>;
  return { ...obj, [head]: rest.length === 0 ? value : setAt(obj[head], rest, value) } as T;
}

/** الإعدادات ← المعادلات: every calculator coefficient, editable, with a reset to defaults. */
export function FormulasScreen() {
  const { meta, data } = useServices();
  const store = new NutritionStore(meta, data.repos);
  const settings = useLive(() => store.getSettings(), [meta, data]);
  return settings ? <FormulasForm key={JSON.stringify(settings)} initial={settings} store={store} /> : <PageHeader title={t('settings.formulas.title')} back={{ to: '/more/settings', label: t('screens.settings.title') }} />;
}

function FormulasForm({ initial, store }: { initial: NutritionSettings; store: NutritionStore }) {
  const showToast = useUiStore((s) => s.showToast);
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((x) => [x.path.join('.'), String(getAt(initial, x.path))]))),
  );
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    let next = draft;
    for (const g of GROUPS) {
      for (const x of g.fields) {
        const n = parseDecimal(text[x.path.join('.')] ?? '');
        if (!Number.isFinite(n)) return setError(t('settings.formulas.invalid', { name: t(x.label) }));
        next = setAt(next, x.path, n);
      }
    }
    const parsed = nutritionSettingsSchema.safeParse(next);
    if (!parsed.success) return setError(t('settings.formulas.invalid', { name: parsed.error.issues[0]?.path.join('.') ?? '' }));
    await store.saveSettings(parsed.data);
    showToast({ message: t('settings.formulas.saved'), duration: 2500 });
  };

  return (
    <>
      <PageHeader title={t('settings.formulas.title')} back={{ to: '/more/settings', label: t('screens.settings.title') }} subtitle={t('settings.formulas.lead')} />
      <section className={styles.card}>
        <Select
          label={t('settings.formulas.defaultFormula')}
          value={draft.defaultFormula}
          onChange={(v) => setDraft((d) => ({ ...d, defaultFormula: v }))}
          options={[
            { value: 'mifflin-st-jeor', label: 'Mifflin-St Jeor' },
            { value: 'katch-mcardle', label: 'Katch-McArdle' },
          ]}
        />
        <label className={styles.check}>
          <input type="checkbox" checked={draft.preferKatchWhenBodyFat} onChange={(e) => setDraft((d) => ({ ...d, preferKatchWhenBodyFat: e.target.checked }))} />
          <span>{t('settings.formulas.preferKatch')}</span>
        </label>
      </section>
      {GROUPS.map((g) => (
        <section key={g.title} className={styles.card}>
          <h2 className={styles.cardTitle}>{t(g.title)}</h2>
          <div className={styles.grid}>
            {g.fields.map((x) => {
              const k = x.path.join('.');
              return (
                <TextField
                  key={k}
                  label={t(x.label)}
                  inputMode="decimal"
                  value={text[k] ?? ''}
                  onChange={(e) => {
                    setText((s) => ({ ...s, [k]: e.target.value }));
                    setError(null);
                  }}
                  ltr
                />
              );
            })}
          </div>
        </section>
      ))}
      <section className={styles.card}>
        {error && (
          <p className={styles.warn} role="alert">
            {error}
          </p>
        )}
        <Button block onClick={() => void save()}>
          {t('settings.formulas.save')}
        </Button>
        <Button
          block
          variant="plain"
          onClick={async () => {
            await store.resetSettings();
            showToast({ message: t('settings.formulas.resetDone'), duration: 2500 });
          }}
        >
          {t('settings.formulas.reset')}
        </Button>
      </section>
    </>
  );
}
