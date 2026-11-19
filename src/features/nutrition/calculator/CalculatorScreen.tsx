import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { calcSteps, calculate, toSavedCalculation, type CalcInput, type NutritionSettings, type SavedCalculation } from '@/domain/meals';
import type { Client, ProgressEntry } from '@/domain/models';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, Num, PageHeader, SegmentedControl, Select, TextField, TitleIcon } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { toIsoDate } from '@/domain/models';
import { ClientNav } from '../shared/ClientNav';
import { calcErrorText } from '../shared/errors';
import { MacroBar } from '../shared/MacroBar';
import { kcalText, oneDecimal, parseDecimal } from '../shared/numbers';
import { Slider } from '../shared/Slider';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore } from '../shared/useNutritionStore';
import { clampGoalPercent, draftToInput, fieldOfError, initialDraft, missingField, type BodyField, type CalcDraft, type Prefill } from './calculatorModel';
import { NavyHelper } from './NavyHelper';
import { StepsDisclosure } from './StepsDisclosure';
import common from '../shared/common.module.css';
import styles from './Calculator.module.css';

const ACTIVITY = ['sedentary', 'light', 'moderate', 'high', 'veryHigh'] as const;

export function CalculatorScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  const store = useNutritionStore();
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}`);
  const settings = useLive(() => store.getSettings(), [store]);
  const saved = useLive(() => store.getCalculation(clientId), [store, clientId]);
  const entries = useLive(() => repos.progress.listByClient(clientId), [repos, clientId]);

  if (client === undefined || settings === undefined || saved === undefined || entries === undefined) {
    return <PageHeader title="" back={{ to: back, label: t('common.back') }} />;
  }
  if (client === null) {
    return (
      <>
        <PageHeader title="" back={{ to: back, label: t('common.back') }} />
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  const latest = [...entries].reverse().find((e) => e.measurements.weightKg !== undefined);
  return <Calculator key={saved?.savedAt ?? 'new'} client={client} settings={settings} saved={saved} latest={latest} back={back} />;
}

interface CalculatorProps {
  client: Client;
  settings: NutritionSettings;
  saved: SavedCalculation | null;
  latest: ProgressEntry | undefined;
  back: string;
}

function Calculator({ client, settings: s, saved, latest, back }: CalculatorProps) {
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((st) => st.showToast);
  const [{ draft: initial, prefill }] = useState<{ draft: CalcDraft; prefill: Prefill }>(() => initialDraft(client, saved, latest, s, new Date()));
  const [draft, setDraft] = useState<CalcDraft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CalcDraft>(key: K, value: CalcDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const input: CalcInput = useMemo(() => draftToInput(draft, parseDecimal), [draft]);
  const result = useMemo(() => calculate(input, s), [input, s]);
  const steps = useMemo(() => (result.ok ? calcSteps(input, result.value, s) : []), [input, result, s]);

  const save = async () => {
    if (!result.ok) return;
    setSaving(true);
    try {
      const snapshot = toSavedCalculation(input, result.value, steps, Date.now());
      await store.saveCalculation(client.id, snapshot);
      // Meal plans compare against the latest target.
      for (const plan of await repos.mealPlans.listByClient(client.id)) {
        await repos.mealPlans.update(plan.id, { targetKcal: snapshot.targetKcal });
      }
      showToast({ message: t('nutrition.calc.saved', { name: client.name }) });
    } finally {
      setSaving(false);
    }
  };

  const goalRange = draft.goal === 'maintain' ? null : s.goalRanges[draft.goal];
  // Friendly validation: an empty field asks for it; an out-of-range one says the accepted range, on the field itself.
  const missing = missingField(draft);
  const L = s.limits;
  const errorText = (() => {
    if (missing) return t(`nutrition.calc.missing.${missing}`);
    if (result.ok) return null;
    const e = result.error;
    if (e === 'invalid_age') return t('nutrition.calc.range.age', { min: L.minAgeYears, max: L.maxAgeYears });
    if (e === 'invalid_height') return t('nutrition.calc.range.height', { min: L.minHeightCm, max: L.maxHeightCm });
    if (e === 'invalid_weight') return t('nutrition.calc.range.weight', { min: L.minWeightKg, max: L.maxWeightKg });
    return calcErrorText(e);
  })();
  const errorField: BodyField | null = missing ?? (result.ok ? null : fieldOfError(result.error));
  const fieldError = (f: BodyField) => (errorField === f && draft[f].trim() !== '' ? errorText : null);
  const hasBodyFat = input.bodyFatPercent !== null;

  return (
    <div className={common.page}>
      <PageHeader title={t('nutrition.calc.title')} subtitle={client.name} back={{ to: back, label: t('common.back') }} />
      <ClientNav clientId={client.id} />

      <section className={common.section} aria-labelledby="calc-body">
        <h2 id="calc-body" className={common.sectionTitle}><TitleIcon name="body" />
          {t('nutrition.calc.body')}
        </h2>
        <div className={common.tile}>
          {(prefill.fromSaved || prefill.fromClient) && (
            <p className={common.caption}>
              {prefill.fromSaved && saved
                ? t('nutrition.calc.prefillSaved', { date: formatIsoDate(toIsoDate(new Date(saved.savedAt))) })
                : t('nutrition.calc.prefillClient')}
            </p>
          )}
          <SegmentedControl
            label={t('nutrition.calc.sex')}
            value={draft.sex}
            onChange={(v) => set('sex', v)}
            options={[
              { value: 'male', label: t('nutrition.calc.male') },
              { value: 'female', label: t('nutrition.calc.female') },
            ]}
          />
          <div className={common.grid2}>
            <TextField label={t('nutrition.calc.age')} inputMode="numeric" ltr value={draft.age} error={fieldError('age')} onChange={(e) => set('age', e.target.value)} />
            <TextField label={t('nutrition.calc.height')} inputMode="decimal" ltr value={draft.height} error={fieldError('height')} onChange={(e) => set('height', e.target.value)} />
            <TextField label={t('nutrition.calc.weight')} inputMode="decimal" ltr value={draft.weight} error={fieldError('weight')} onChange={(e) => set('weight', e.target.value)} />
            <TextField
              label={t('nutrition.calc.bodyFat')}
              hint={t('common.optional')}
              inputMode="decimal"
              ltr
              value={draft.bodyFat}
              error={fieldError('bodyFat')}
              onChange={(e) => {
                const text = e.target.value;
                setDraft((d) => ({ ...d, bodyFat: text, formula: text.trim() === '' && d.formula === 'katch-mcardle' ? 'mifflin-st-jeor' : d.formula }));
              }}
            />
          </div>
          <NavyHelper
            sex={draft.sex}
            heightCm={input.heightCm}
            waistCm={client.measurements.waistCm}
            hipCm={client.measurements.hipCm}
            navy={s.navy}
            limits={s.limits}
            onUse={(bf) => setDraft((d) => ({ ...d, bodyFat: String(Math.round(bf * 10) / 10) }))}
          />
        </div>
      </section>

      <section className={common.section} aria-labelledby="calc-formula">
        <h2 id="calc-formula" className={common.sectionTitle}><TitleIcon name="filter" />
          {t('nutrition.calc.formulaTitle')}
        </h2>
        <div className={common.tile}>
          <SegmentedControl
            label={t('nutrition.calc.formula')}
            value={draft.formula}
            onChange={(v) => set('formula', v)}
            options={[
              { value: 'mifflin-st-jeor', label: t('nutrition.formulas.mifflin-st-jeor') },
              { value: 'katch-mcardle', label: t('nutrition.formulas.katch-mcardle') },
            ]}
          />
          {draft.formula === 'katch-mcardle' && !hasBodyFat && <p className={common.caption}>{t('nutrition.calc.katchNeedsBodyFat')}</p>}
          <Select
            label={t('nutrition.calc.activity')}
            value={draft.activity}
            onChange={(v) => set('activity', v)}
            options={ACTIVITY.map((a) => ({ value: a, label: t('nutrition.activityOption', { name: t(`nutrition.activity.${a}`), factor: s.activityFactors[a] }) }))}
          />
          <SegmentedControl
            label={t('nutrition.calc.goal')}
            value={draft.goal}
            onChange={(v) => setDraft((d) => ({ ...d, goal: v, goalPercent: clampGoalPercent(v, d.goalPercent, s) }))}
            options={[
              { value: 'cut', label: t('nutrition.goals.cut') },
              { value: 'maintain', label: t('nutrition.goals.maintain') },
              { value: 'bulk', label: t('nutrition.goals.bulk') },
            ]}
          />
          {goalRange && (
            <Slider
              label={draft.goal === 'cut' ? t('nutrition.calc.cutPercent') : t('nutrition.calc.bulkPercent')}
              value={draft.goalPercent}
              min={goalRange.min}
              max={goalRange.max}
              step={1}
              onChange={(v) => set('goalPercent', v)}
              display={`${draft.goal === 'cut' ? '−' : '+'}${draft.goalPercent}%`}
            />
          )}
          <Slider
            label={t('nutrition.calc.protein')}
            value={draft.proteinPerKg}
            min={s.proteinPerKgRange.min}
            max={s.proteinPerKgRange.max}
            step={0.1}
            onChange={(v) => set('proteinPerKg', Math.round(v * 10) / 10)}
            display={draft.proteinPerKg.toFixed(1)}
            unit={t('nutrition.units.gPerKg')}
          />
          <Slider
            label={t('nutrition.calc.fat')}
            value={draft.fatPerKg}
            min={s.fatPerKgRange.min}
            max={s.fatPerKgRange.max}
            step={0.05}
            onChange={(v) => set('fatPerKg', Math.round(v * 100) / 100)}
            display={draft.fatPerKg.toFixed(2)}
            unit={t('nutrition.units.gPerKg')}
          />
        </div>
      </section>

      <section className={common.section} aria-labelledby="calc-result" aria-live="polite">
        <h2 id="calc-result" className={common.sectionTitle}><TitleIcon name="flame" />
          {t('nutrition.calc.result')}
        </h2>
        {errorText !== null || !result.ok ? (
          <p className={missing ? common.note : common.error} role="alert">
            <Icon name="alert" />
            {errorText}
          </p>
        ) : (
          <div className={common.tile} data-testid="calc-result">
            <div className={styles.hero}>
              <p className={styles.heroLabel}>{t(`nutrition.calc.targetFor.${draft.goal}`)}</p>
              <p className={styles.heroValue}>
                <Num>{kcalText(result.value.targetKcal)}</Num>
                <span>{t('nutrition.units.kcalPerDay')}</span>
              </p>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>{t('nutrition.calc.bmr')}</dt>
                <dd>
                  <Num>{kcalText(result.value.bmr)}</Num>
                </dd>
              </div>
              <div>
                <dt>{t('nutrition.calc.tdee')}</dt>
                <dd>
                  <Num>{kcalText(result.value.tdee)}</Num>
                </dd>
              </div>
              <div>
                <dt>{t('nutrition.calc.bmi')}</dt>
                <dd>
                  <Num>{oneDecimal(result.value.bmi)}</Num>
                </dd>
              </div>
            </dl>
            <MacroBar
              proteinG={result.value.macros.proteinG}
              carbG={result.value.macros.carbG}
              fatG={result.value.macros.fatG}
              proteinKcal={result.value.macros.proteinKcal}
              carbKcal={result.value.macros.carbKcal}
              fatKcal={result.value.macros.fatKcal}
            />
            {result.value.macros.carbsClamped && (
              <p className={common.note}>{t('nutrition.calc.carbsClamped', { kcal: kcalText(result.value.macros.excessKcal) })}</p>
            )}
            <p className={styles.water}>
              <Icon name="target" />
              <span>
                {t('nutrition.calc.water')}{' '}
                <Num>
                  {oneDecimal(result.value.water.minMl / 1000)}–{oneDecimal(result.value.water.maxMl / 1000)}
                </Num>{' '}
                {t('nutrition.units.liter')}
              </span>
            </p>
          </div>
        )}
      </section>

      {result.ok && !missing && (
        <section className={common.section}>
          <StepsDisclosure steps={steps} />
        </section>
      )}

      <div className={common.actions}>
        <Button size="large" icon="check" disabled={!result.ok || missing !== null || saving} onClick={() => void save()}>
          {t('nutrition.calc.save')}
        </Button>
      </div>
      {saved && (
        <p className={styles.savedAt}>
          {t('nutrition.calc.lastSaved', { date: formatIsoDate(toIsoDate(new Date(saved.savedAt))), kcal: kcalText(saved.targetKcal) })}
        </p>
      )}
    </div>
  );
}
