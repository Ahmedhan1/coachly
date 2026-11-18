import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLive } from '@/app/useLive';
import {
  DIET_SCHEDULES,
  dietNoteKeys,
  dietPlanTargets,
  goalDefaults,
  gramRecipe,
  macroSplit,
  planGramWeek,
  withKcal,
  type DietGoal,
  type DietSettings,
  type DietSchedule,
  type DietStyle,
  type GramRecipe,
  type IngredientEntry,
  type MealsPerDay,
  type NutritionSettings,
  type SavedCalculation,
} from '@/domain/meals';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, EmptyState, PageHeader, SegmentedControl, Select } from '@/ui';
import { ClientNav } from '../shared/ClientNav';
import { Slider } from '../shared/Slider';
import { parseDecimal } from '../shared/numbers';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { useRecipesWithNutrition } from '../meals/useRecipeLookup';
import { DietSettingsSheet } from './DietSettingsSheet';
import { DietWeek } from './DietWeek';
import common from '../shared/common.module.css';
import styles from './Diet.module.css';

const GOALS: readonly DietGoal[] = ['cut', 'bulk', 'maintain', 'recomp'];
const STYLES: readonly DietStyle[] = ['balanced', 'low_carb', 'high_protein'];
const KCAL_STEP = 50;

/** Client → goal and eating system → targets from the saved calculator result → a 7-day plan in exact grams, live. */
export function DietScreen() {
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const store = useNutritionStore();
  const ready = useStarterData();
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}/meals`);
  const saved = useLive(() => store.getCalculation(clientId), [store, clientId]);
  const settings = useLive(() => store.getSettings(), [store]);
  const foods = useLive(() => store.getIngredients(), [store, ready]);
  const recipes = useRecipesWithNutrition();
  const [version, setVersion] = useState(0);
  const dietSettings = useLive(() => store.getDietSettings(), [store, version]);

  const header = <PageHeader title={t('nutrition.diet.title')} subtitle={client?.name} back={{ to: back, label: t('nutrition.diet.back') }} />;
  // Wait for the starter cookbook: planning while it is still being written would re-plan for every new recipe.
  if (!ready && client)
    return (
      <div className={common.page}>
        {header}
        <div className={styles.preparing} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p>{t('nutrition.diet.preparing')}</p>
        </div>
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  if (!ready || client === undefined || saved === undefined || settings === undefined || dietSettings === undefined || recipes === undefined || foods === undefined) return header;
  if (client === null) {
    return (
      <>
        {header}
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  if (saved === null) {
    return (
      <div className={common.page}>
        {header}
        <ClientNav clientId={client.id} />
        <div className={common.section}>
          <EmptyState
            icon="target"
            title={t('nutrition.diet.needCalc')}
            body={t('nutrition.diet.intro')}
            action={<Button onClick={() => navigate(`/clients/${client.id}/nutrition`, { replace: true })}>{t('nutrition.diet.goToCalc')}</Button>}
          />
        </div>
      </div>
    );
  }
  return (
    <DietView client={client} saved={saved} settings={settings} dietSettings={dietSettings} recipes={recipes} foods={foods} header={header} onSettingsChanged={() => setVersion((v) => v + 1)} />
  );
}

interface ViewProps {
  client: Client;
  saved: SavedCalculation;
  settings: NutritionSettings;
  dietSettings: DietSettings;
  recipes: NonNullable<ReturnType<typeof useRecipesWithNutrition>>;
  foods: IngredientEntry[];
  header: ReactNode;
  onSettingsChanged: () => void;
}

function DietView({ client, saved, settings, dietSettings, recipes, foods, header, onSettingsChanged }: ViewProps) {
  const navigate = useNavigate();
  const startGoal: DietGoal = saved.input.goal;
  const initial = goalDefaults(startGoal, settings, dietSettings);
  const [goal, setGoal] = useState<DietGoal>(startGoal);
  const [style, setStyle] = useState<DietStyle>('balanced');
  const [schedule, setSchedule] = useState<DietSchedule>('normal');
  const [meals, setMeals] = useState<MealsPerDay>(4);
  const [vegetarian, setVegetarian] = useState(false);
  const [percent, setPercent] = useState(initial.percent);
  const [proteinPerKg, setProteinPerKg] = useState(initial.proteinPerKg);
  const [fatPerKg, setFatPerKg] = useState(initial.fatPerKg);
  const [kcalOverride, setKcalOverride] = useState<number | null>(null);
  const [kcalText, setKcalText] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const pickGoal = (g: DietGoal) => {
    const d = goalDefaults(g, settings, dietSettings);
    setGoal(g);
    setPercent(d.percent);
    setProteinPerKg(d.proteinPerKg);
    setFatPerKg(d.fatPerKg);
    setKcalOverride(null);
  };

  const plan = useMemo(
    () => dietPlanTargets({ saved, goal, style, percent, proteinPerKg, fatPerKg }, settings, dietSettings),
    [saved, goal, style, percent, proteinPerKg, fatPerKg, settings, dietSettings],
  );
  const targets = useMemo(() => (kcalOverride === null ? plan.targets : withKcal(plan.targets, kcalOverride, settings.kcalPerGram)), [plan, kcalOverride, settings]);
  const book: GramRecipe[] = useMemo(() => recipes.map((r) => gramRecipe(r.recipe, foods)), [recipes, foods]);
  const perServing = useMemo(() => new Map(recipes.map((r) => [r.recipe.id as string, r.perServing.kcal])), [recipes]);

  // Planning follows the controls without blocking them (a slider drag stays smooth on a phone).
  const controls = useMemo(() => ({ targets, goal, style, schedule, meals, vegetarian, seed }), [targets, goal, style, schedule, meals, vegetarian, seed]);
  const live = useDeferredValue(controls);
  const week = useMemo(
    () => planGramWeek(book, live.targets, { goal: live.goal, schedule: live.schedule, mealsPerDay: live.meals, days: 7, style: live.style, vegetarian: live.vegetarian, seed: live.seed }, dietSettings),
    [book, live, dietSettings],
  );
  /** Hand edits survive target changes but not a new layout (meals, schedule, filters, variation). */
  const layoutKey = `${live.schedule}|${live.meals}|${live.style}|${live.vegetarian}|${live.seed}|${live.goal}|${book.length}`;

  const range = goal === 'cut' ? settings.goalRanges.cut : settings.goalRanges.bulk;
  const noteKeys = dietNoteKeys(goal, style, schedule);
  const r1 = (n: number) => String(Math.round(n));
  const split = macroSplit(targets, settings.kcalPerGram);
  const setKcal = (n: number) => {
    setKcalText(null);
    setKcalOverride(Math.max(800, Math.min(8000, Math.round(n))));
  };
  const commitKcalText = () => {
    if (kcalText === null) return;
    const n = parseDecimal(kcalText);
    if (Number.isFinite(n) && n >= 800) setKcal(n);
    setKcalText(null);
  };

  return (
    <div className={common.page}>
      {header}
      <ClientNav clientId={client.id} />
      <p className={`${common.muted} ${styles.intro}`}>{t('nutrition.diet.intro')}</p>

      <section className={common.section}>
        <div className={common.tile}>
          <p className={common.caption}>{t('nutrition.diet.burn', { kcal: saved.tdee })}</p>
          <SegmentedControl label={t('nutrition.diet.goalTitle')} options={GOALS.map((g) => ({ value: g, label: t(`nutrition.diet.goal.${g}`) }))} value={goal} onChange={pickGoal} wrap />
          <SegmentedControl label={t('nutrition.diet.styleTitle')} options={STYLES.map((s) => ({ value: s, label: t(`nutrition.diet.style.${s}`) }))} value={style} onChange={setStyle} wrap />
          <SegmentedControl
            label={t('nutrition.diet.scheduleTitle')}
            options={DIET_SCHEDULES.map((s) => ({ value: s, label: t(`nutrition.diet.schedule.${s}`) }))}
            value={schedule}
            onChange={setSchedule}
            wrap
          />
          <Select
            label={t('nutrition.diet.mealsTitle')}
            value={String(meals)}
            onChange={(v) => setMeals(Number(v) as MealsPerDay)}
            options={(['3', '4', '5'] as const).map((n) => ({ value: n, label: t('nutrition.diet.mealsOption', { n }) }))}
          />
          <label className={styles.check}>
            <input type="checkbox" checked={vegetarian} onChange={(e) => setVegetarian(e.target.checked)} />
            {t('nutrition.diet.vegetarian')}
          </label>
          {(goal === 'cut' || goal === 'bulk') && (
            <Slider
              label={goal === 'cut' ? t('nutrition.diet.percentCut') : t('nutrition.diet.percentBulk')}
              value={percent}
              min={range.min}
              max={range.max}
              step={1}
              onChange={(v) => (setPercent(v), setKcalOverride(null))}
              display={`${percent}%`}
            />
          )}
          <Slider label={t('nutrition.diet.proteinPerKg')} value={proteinPerKg} min={settings.proteinPerKgRange.min} max={settings.proteinPerKgRange.max} step={0.1} onChange={setProteinPerKg} display={String(Math.round(proteinPerKg * 10) / 10)} />
          <Slider label={t('nutrition.diet.fatPerKg')} value={fatPerKg} min={settings.fatPerKgRange.min} max={settings.fatPerKgRange.max} step={0.1} onChange={setFatPerKg} display={String(Math.round(fatPerKg * 10) / 10)} />
        </div>
      </section>

      <section className={common.section} aria-label={t('nutrition.diet.targetsTitle')}>
        <h2 className={common.sectionTitle}>{t('nutrition.diet.targetsTitle')}</h2>
        <div className={styles.kcalRow}>
          <span className={styles.kcalLabel}>{t('nutrition.diet.kcalTarget')}</span>
          <div className={styles.stepper}>
            <button type="button" className={styles.stepBtn} aria-label={t('nutrition.diet.kcalLess')} onClick={() => setKcal(targets.kcal - KCAL_STEP)}>
              −
            </button>
            <input
              className={`${styles.kcalInput} num`}
              inputMode="numeric"
              aria-label={t('nutrition.diet.kcalField')}
              value={kcalText ?? r1(targets.kcal)}
              onChange={(e) => setKcalText(e.target.value)}
              onBlur={commitKcalText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <button type="button" className={styles.stepBtn} aria-label={t('nutrition.diet.kcalMore')} onClick={() => setKcal(targets.kcal + KCAL_STEP)}>
              +
            </button>
          </div>
        </div>
        <p className={common.caption}>
          {t('nutrition.diet.kcalFromCalc', { kcal: r1(plan.targets.kcal) })}
          {kcalOverride !== null && (
            <>
              {' · '}
              <button type="button" className={styles.linkButton} onClick={() => setKcalOverride(null)}>
                {t('nutrition.diet.kcalReset')}
              </button>
            </>
          )}
        </p>
        <dl className={styles.targets}>
          <div>
            <dt>{t('nutrition.diet.kcal')}</dt>
            <dd className="num">{r1(targets.kcal)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.protein')}</dt>
            <dd className="num">{r1(targets.proteinG)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.carb')}</dt>
            <dd className="num">{r1(targets.carbG)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.fat')}</dt>
            <dd className="num">{r1(targets.fatG)}</dd>
          </div>
        </dl>
        <p className={common.caption}>{t('nutrition.diet.split', { p: split.p, c: split.c, f: split.f })}</p>
        {plan.floored && kcalOverride === null && <p className={common.note}>{t('nutrition.diet.flooredNote', { kcal: r1(targets.kcal) })}</p>}
        {plan.warnings.map((w) => (
          <p key={w} className={common.note} role="status">
            {t(`nutrition.diet.warn.${w}`)}
          </p>
        ))}
        <p className={common.caption}>{t('nutrition.diet.liveHint')}</p>
        <div className={common.actions}>
          <Button variant="secondary" icon="undo" onClick={() => setSeed((s) => s + 1)}>
            {t('nutrition.diet.variation')}
          </Button>
          <Button variant="secondary" icon="settings" onClick={() => setShowSettings(true)}>
            {t('nutrition.diet.settingsOpen')}
          </Button>
        </div>
      </section>

      {book.length === 0 ? (
        <p className={common.note}>{t('nutrition.diet.noRecipes')}</p>
      ) : (
        <DietWeek
          key={layoutKey}
          client={client}
          week={week}
          book={book}
          recipes={recipes}
          foods={foods}
          perServing={perServing}
          targets={live.targets}
          options={{ goal: live.goal, style: live.style, vegetarian: live.vegetarian }}
          ds={dietSettings}
          noteKeys={noteKeys}
          onSaved={() => navigate(`/clients/${client.id}/meals`, { replace: true })}
        />
      )}

      {showSettings && (
        <DietSettingsSheet
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            onSettingsChanged();
          }}
        />
      )}
    </div>
  );
}
