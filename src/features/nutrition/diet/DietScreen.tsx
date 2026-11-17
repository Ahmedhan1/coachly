import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLive } from '@/app/useLive';
import {
  DIET_SCHEDULES,
  dietNoteKeys,
  dietPlanTargets,
  goalDefaults,
  planWeek,
  type DietGoal,
  type DietSettings,
  type NutritionSettings,
  type DietRecipe,
  type DietSchedule,
  type DietStyle,
  type MealsPerDay,
  type SavedCalculation,
} from '@/domain/meals';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, EmptyState, PageHeader, SegmentedControl, Select } from '@/ui';
import { ClientNav } from '../shared/ClientNav';
import { Slider } from '../shared/Slider';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { useRecipesWithNutrition } from '../meals/useRecipeLookup';
import { DietSettingsSheet } from './DietSettingsSheet';
import { DietWeek } from './DietWeek';
import common from '../shared/common.module.css';
import styles from './Diet.module.css';

const GOALS: readonly DietGoal[] = ['cut', 'bulk', 'maintain', 'recomp'];
const STYLES: readonly DietStyle[] = ['balanced', 'low_carb', 'high_protein'];

/** Client → goal and eating system → targets from the saved calculator result → a 7-day plan to review and save. */
export function DietScreen() {
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const store = useNutritionStore();
  useStarterData();
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}/meals`);
  const saved = useLive(() => store.getCalculation(clientId), [store, clientId]);
  const settings = useLive(() => store.getSettings(), [store]);
  const recipes = useRecipesWithNutrition();
  const [version, setVersion] = useState(0);
  const dietSettings = useLive(() => store.getDietSettings(), [store, version]);

  const header = <PageHeader title={t('nutrition.diet.title')} subtitle={client?.name} back={{ to: back, label: t('nutrition.diet.back') }} />;
  if (client === undefined || saved === undefined || settings === undefined || dietSettings === undefined || recipes === undefined) return header;
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
  return <DietView client={client} saved={saved} settings={settings} dietSettings={dietSettings} recipes={recipes} header={header} onSettingsChanged={() => setVersion((v) => v + 1)} />;
}

interface ViewProps {
  client: Client;
  saved: SavedCalculation;
  settings: NutritionSettings;
  dietSettings: DietSettings;
  recipes: NonNullable<ReturnType<typeof useRecipesWithNutrition>>;
  header: ReactNode;
  onSettingsChanged: () => void;
}

function DietView({ client, saved, settings, dietSettings, recipes, header, onSettingsChanged }: ViewProps) {
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
  const [generation, setGeneration] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const pickGoal = (g: DietGoal) => {
    const d = goalDefaults(g, settings, dietSettings);
    setGoal(g);
    setPercent(d.percent);
    setProteinPerKg(d.proteinPerKg);
    setFatPerKg(d.fatPerKg);
    setGenerated(false);
  };
  const invalidate = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setGenerated(false);
  };

  const plan = useMemo(
    () => dietPlanTargets({ saved, goal, style, percent, proteinPerKg, fatPerKg }, settings, dietSettings),
    [saved, goal, style, percent, proteinPerKg, fatPerKg, settings, dietSettings],
  );
  const book: DietRecipe[] = useMemo(() => recipes.map((r) => ({ id: r.recipe.id, tags: r.recipe.tags, perServing: r.perServing })), [recipes]);
  const week = useMemo(
    () => (generated ? planWeek(book, plan.targets, { goal, schedule, mealsPerDay: meals, days: 7, style, vegetarian, seed: generation }, dietSettings) : null),
    [generated, generation, book, plan, goal, schedule, meals, style, vegetarian, dietSettings],
  );

  const range = goal === 'cut' ? settings.goalRanges.cut : settings.goalRanges.bulk;
  const noteKeys = dietNoteKeys(goal, style, schedule);
  const r1 = (n: number) => String(Math.round(n));
  const tg = plan.targets;

  return (
    <div className={common.page}>
      {header}
      <ClientNav clientId={client.id} />
      <p className={`${common.muted} ${styles.intro}`}>{t('nutrition.diet.intro')}</p>

      <section className={common.section}>
        <div className={common.tile}>
          <p className={common.caption}>{t('nutrition.diet.burn', { kcal: saved.tdee })}</p>
          <SegmentedControl label={t('nutrition.diet.goalTitle')} options={GOALS.map((g) => ({ value: g, label: t(`nutrition.diet.goal.${g}`) }))} value={goal} onChange={pickGoal} wrap />
          <SegmentedControl label={t('nutrition.diet.styleTitle')} options={STYLES.map((s) => ({ value: s, label: t(`nutrition.diet.style.${s}`) }))} value={style} onChange={invalidate(setStyle)} wrap />
          <SegmentedControl
            label={t('nutrition.diet.scheduleTitle')}
            options={DIET_SCHEDULES.map((s) => ({ value: s, label: t(`nutrition.diet.schedule.${s}`) }))}
            value={schedule}
            onChange={invalidate(setSchedule)}
            wrap
          />
          <Select
            label={t('nutrition.diet.mealsTitle')}
            value={String(meals)}
            onChange={(v) => invalidate(setMeals)(Number(v) as MealsPerDay)}
            options={(['3', '4', '5'] as const).map((n) => ({ value: n, label: t('nutrition.diet.mealsOption', { n }) }))}
          />
          <label className={styles.check}>
            <input type="checkbox" checked={vegetarian} onChange={(e) => invalidate(setVegetarian)(e.target.checked)} />
            {t('nutrition.diet.vegetarian')}
          </label>
          {(goal === 'cut' || goal === 'bulk') && (
            <Slider
              label={goal === 'cut' ? t('nutrition.diet.percentCut') : t('nutrition.diet.percentBulk')}
              value={percent}
              min={range.min}
              max={range.max}
              step={1}
              onChange={invalidate(setPercent)}
              display={`${percent}%`}
            />
          )}
          <Slider label={t('nutrition.diet.proteinPerKg')} value={proteinPerKg} min={settings.proteinPerKgRange.min} max={settings.proteinPerKgRange.max} step={0.1} onChange={invalidate(setProteinPerKg)} display={String(Math.round(proteinPerKg * 10) / 10)} />
          <Slider label={t('nutrition.diet.fatPerKg')} value={fatPerKg} min={settings.fatPerKgRange.min} max={settings.fatPerKgRange.max} step={0.1} onChange={invalidate(setFatPerKg)} display={String(Math.round(fatPerKg * 10) / 10)} />
        </div>
      </section>

      <section className={common.section} aria-label={t('nutrition.diet.targetsTitle')}>
        <h2 className={common.sectionTitle}>{t('nutrition.diet.targetsTitle')}</h2>
        <dl className={styles.targets}>
          <div>
            <dt>{t('nutrition.diet.kcal')}</dt>
            <dd className="num">{r1(tg.kcal)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.protein')}</dt>
            <dd className="num">{r1(tg.proteinG)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.carb')}</dt>
            <dd className="num">{r1(tg.carbG)}</dd>
          </div>
          <div>
            <dt>{t('nutrition.macros.fat')}</dt>
            <dd className="num">{r1(tg.fatG)}</dd>
          </div>
        </dl>
        {plan.floored && <p className={common.note}>{t('nutrition.diet.flooredNote', { kcal: r1(tg.kcal) })}</p>}
        {plan.warnings.map((w) => (
          <p key={w} className={common.note} role="status">
            {t(`nutrition.diet.warn.${w}`)}
          </p>
        ))}
        <div className={common.actions}>
          <Button
            icon="target"
            onClick={() => {
              setGenerated(true);
              setGeneration((g) => g + 1);
            }}
          >
            {generated ? t('nutrition.diet.regenerate') : t('nutrition.diet.generate')}
          </Button>
          <Button variant="secondary" icon="settings" onClick={() => setShowSettings(true)}>
            {t('nutrition.diet.settingsOpen')}
          </Button>
        </div>
      </section>

      {generated && week && (
        <DietWeek
          client={client}
          week={week}
          book={book}
          recipes={recipes}
          targets={tg}
          goal={goal}
          style={style}
          vegetarian={vegetarian}
          ds={dietSettings}
          noteKeys={noteKeys}
          onSaved={() => navigate(`/clients/${client.id}/meals`, { replace: true })}
        />
      )}

      {showSettings && <DietSettingsSheet onClose={() => setShowSettings(false)} onSaved={() => { onSettingsChanged(); setGenerated(false); }} />}
    </div>
  );
}
