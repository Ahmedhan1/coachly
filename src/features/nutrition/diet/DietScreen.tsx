import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useUiStore } from '@/app/uiStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import {
  DIET_SCHEDULES,
  applySplit,
  blockedRecipes,
  cycleDayTypes,
  cycleTargets,
  dietNoteKeys,
  dietPlanTargets,
  goalCoefficientsFrom,
  goalDiet,
  goalDefaults,
  gramRecipe,
  macroControlWarnings,
  macroSpecFrom,
  macroSplit,
  macroTargetsFromSpec,
  planGramWeek,
  presetShares,
  recipeBoosts,
  slotsFor,
  withKcal,
  type DietGoal,
  type DietProfile,
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
import { bodyFatForPlan, waterIntake, type BodyNow } from '@/domain/nutrition';
import { Button, EmptyState, Icon, PageHeader, SegmentedControl, Select } from '@/ui';
import { ClientNav } from '../shared/ClientNav';
import { Slider } from '../shared/Slider';
import { parseDecimal } from '../shared/numbers';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { useRecipesWithNutrition } from '../meals/useRecipeLookup';
import { CyclePanel } from './CyclePanel';
import { GoalPanel } from './GoalPanel';
import { DietSettingsSheet } from './DietSettingsSheet';
import { DietWeek } from './DietWeek';
import { MacroPanel } from './MacroPanel';
import { PrefsSheet } from './PrefsSheet';
import { SplitPanel } from './SplitPanel';
import { TrendCard } from './TrendCard';
import { useDietProfile } from './useDietProfile';
import cal from './Cal.module.css';
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
  const { profile, save: saveProfile } = useDietProfile(clientId);

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
  if (!ready || client === undefined || saved === undefined || settings === undefined || dietSettings === undefined || recipes === undefined || foods === undefined || profile === undefined)
    return header;
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
            action={<Button icon="chart" onClick={() => navigate(`/clients/${client.id}/nutrition`, { replace: true })}>{t('nutrition.diet.goToCalc')}</Button>}
          />
        </div>
      </div>
    );
  }
  return (
    <DietView
      key={client.id}
      client={client}
      saved={saved}
      settings={settings}
      dietSettings={dietSettings}
      recipes={recipes}
      foods={foods}
      header={header}
      initialProfile={profile}
      onProfile={(p) => void saveProfile(p)}
      onSettingsChanged={() => setVersion((v) => v + 1)}
    />
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
  initialProfile: DietProfile;
  onProfile: (p: DietProfile) => void;
  onSettingsChanged: () => void;
}

function DietView({ client, saved, settings, dietSettings, recipes, foods, header, initialProfile, onProfile, onSettingsChanged }: ViewProps) {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [profile, setProfileState] = useState<DietProfile>(initialProfile);
  const setProfile = (p: DietProfile) => {
    setProfileState(p);
    onProfile(p);
  };
  const [showPrefs, setShowPrefs] = useState(false);
  const kpg = settings.kcalPerGram;
  const weightKg = saved.input.weightKg;
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
  // Goal planner: target weight + duration → calories (week 1, adaptive), protein from goal and body.
  const [now] = useState(() => new Date());
  const repos = useRepos();
  const entries = useLive(() => repos.progress.listByClient(client.id), [repos, client.id]);
  // Body fat: the calculator's or a measured one; else the US Navy estimate from neck/waist(/hip) measurements.
  const fat = useMemo(
    () =>
      bodyFatForPlan(
        saved.input.bodyFatPercent ?? client.measurements.bodyFatPercent ?? null,
        [{ date: '0000-00-00', measurements: client.measurements }, ...(entries ?? [])],
        saved.input.sex,
        saved.input.heightCm,
        settings.navy,
      ),
    [saved, client, entries, settings],
  );
  const body: BodyNow = useMemo(
    () => ({
      sex: saved.input.sex,
      ageYears: saved.input.ageYears,
      heightCm: saved.input.heightCm,
      weightKg: saved.input.weightKg,
      bodyFatPercent: fat.bodyFatPercent,
      activityFactor: settings.activityFactors[saved.input.activity],
    }),
    [saved, fat, settings],
  );
  const gd = useMemo(
    () =>
      goalDiet(
        { body, goal, targetWeightKg: profile.plan.targetWeightKg, weeks: profile.plan.weeks, experience: profile.plan.experience, proteinPerKg: profile.plan.proteinPerKg },
        settings,
        dietSettings,
      ),
    [body, goal, profile.plan, settings, dietSettings],
  );
  const baseTargets = profile.plan.enabled ? gd.targets : plan.targets;
  const setPlan = (p: DietProfile['plan']) => {
    setKcalOverride(null);
    setKcalText(null);
    setProfile({ ...profile, plan: p });
  };
  const kcalTargets = useMemo(() => (kcalOverride === null ? baseTargets : withKcal(baseTargets, kcalOverride, settings.kcalPerGram)), [baseTargets, kcalOverride, settings]);
  // The trainer's own macro split (grams / g per kg / %) divides the same calories.
  const specTargets = useMemo(() => (profile.macro ? macroTargetsFromSpec(kcalTargets.kcal, weightKg, profile.macro, kpg) : null), [profile.macro, kcalTargets, weightKg, kpg]);
  const targets = useMemo(
    () => (specTargets ? { kcal: specTargets.kcal, proteinG: specTargets.proteinG, carbG: specTargets.carbG, fatG: specTargets.fatG } : kcalTargets),
    [specTargets, kcalTargets],
  );
  const macroWarnings = specTargets ? macroControlWarnings(targets, { goal, weightKg, sex: saved.input.sex, overflowKcal: specTargets.overflowKcal }, dietSettings, kpg) : [];
  const book: GramRecipe[] = useMemo(() => recipes.map((r) => gramRecipe(r.recipe, foods)), [recipes, foods]);
  const exclude = useMemo(() => blockedRecipes(book, profile.prefs), [book, profile.prefs]);
  const boost = useMemo(() => recipeBoosts(book, profile.prefs), [book, profile.prefs]);
  // Meal split: preset or the trainer's own shares, plus carbs moved around the workout time.
  const slots = useMemo(() => {
    const base = slotsFor(schedule, meals, dietSettings);
    const shares = profile.split === 'custom' ? profile.shares : presetShares(base, profile.split, profile.workoutTime);
    return applySplit(base, shares, profile.workoutTime);
  }, [schedule, meals, dietSettings, profile.split, profile.shares, profile.workoutTime]);
  // Carb cycling: training / rest / refeed days, weekly average kept on the day target.
  const extraKcal = profile.cycle.extraKcal ?? dietSettings.trainingDayExtraKcal;
  const dayTypes = useMemo(() => cycleDayTypes(7, profile.cycle.trainingDays, profile.cycle.refeedDay), [profile.cycle.trainingDays, profile.cycle.refeedDay]);
  const cycle = useMemo(() => cycleTargets(targets, dayTypes, { trainingExtraKcal: extraKcal, refeedKcal: saved.tdee }, kpg), [targets, dayTypes, extraKcal, saved.tdee, kpg]);
  const dayTargets = profile.cycle.enabled ? cycle.days : null;
  const water = waterIntake(weightKg, settings.waterMlPerKg);
  const perServing = useMemo(() => new Map(recipes.map((r) => [r.recipe.id as string, r.perServing.kcal])), [recipes]);

  // Planning follows the controls without blocking them (a slider drag stays smooth on a phone).
  const controls = useMemo(
    () => ({ targets, goal, style, schedule, meals, vegetarian, seed, slots, dayTargets, exclude, boost }),
    [targets, goal, style, schedule, meals, vegetarian, seed, slots, dayTargets, exclude, boost],
  );
  const live = useDeferredValue(controls);
  const week = useMemo(
    () =>
      planGramWeek(
        book,
        live.targets,
        {
          goal: live.goal,
          schedule: live.schedule,
          mealsPerDay: live.meals,
          days: 7,
          style: live.style,
          vegetarian: live.vegetarian,
          seed: live.seed,
          slots: live.slots,
          ...(live.dayTargets ? { dayTargets: live.dayTargets } : {}),
          exclude: live.exclude,
          boost: live.boost,
        },
        dietSettings,
      ),
    [book, live, dietSettings],
  );
  /** Hand edits survive target and split changes but not a new layout (meals, schedule, filters, food prefs, variation). */
  const layoutKey = `${live.schedule}|${live.meals}|${live.style}|${live.vegetarian}|${live.seed}|${live.goal}|${book.length}|${JSON.stringify(profile.prefs)}|${profile.cycle.enabled}`;
  const liveDayTargets = useMemo(() => Array.from({ length: 7 }, (_, i) => live.dayTargets?.[i] ?? live.targets), [live]);
  const prefsCount = profile.prefs.allergies.length + profile.prefs.dislikes.length + profile.prefs.loves.length + (profile.prefs.budget ? 1 : 0);
  const applyTrend = (delta: number) => {
    const next = Math.max(800, Math.min(8000, Math.round(kcalTargets.kcal + delta)));
    setKcalText(null);
    setKcalOverride(next);
    showToast({ message: t('nutrition.cal.applied', { kcal: next }), duration: 3000 });
  };
  const toggleMacro = (on: boolean) =>
    setProfile({ ...profile, macro: on ? macroSpecFrom(kcalTargets, weightKg, { protein: 'perKg', fat: 'perKg', carb: 'grams' }, 'carb', kpg) : null });

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
          {(goal === 'cut' || goal === 'bulk') && !profile.plan.enabled && (
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
          {!profile.macro && !profile.plan.enabled && (
            <>
              <Slider label={t('nutrition.diet.proteinPerKg')} value={proteinPerKg} min={settings.proteinPerKgRange.min} max={settings.proteinPerKgRange.max} step={0.1} onChange={setProteinPerKg} display={String(Math.round(proteinPerKg * 10) / 10)} />
              <Slider label={t('nutrition.diet.fatPerKg')} value={fatPerKg} min={settings.fatPerKgRange.min} max={settings.fatPerKgRange.max} step={0.1} onChange={setFatPerKg} display={String(Math.round(fatPerKg * 10) / 10)} />
            </>
          )}
        </div>
      </section>

      <section className={common.section} aria-label={t('nutrition.goal.title')}>
        <div className={common.tile}>
          <h2 className={common.sectionTitle}>{t('nutrition.goal.title')}</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={profile.plan.enabled}
              onChange={(e) => setPlan({ ...profile.plan, enabled: e.target.checked, ...(client.trainingProfile?.level && !profile.plan.enabled ? { experience: client.trainingProfile.level } : {}) })}
            />
            {t('nutrition.goal.enable')}
          </label>
          {profile.plan.enabled && (
            <GoalPanel body={body} goal={goal} state={profile.plan} diet={gd} coeffs={goalCoefficientsFrom(dietSettings)} settings={settings} now={now} bodyFatSource={fat.source} onChange={setPlan} />
          )}
        </div>
      </section>

      <section className={common.section}>
        <TrendCard clientId={client.id} goal={goal} ds={dietSettings} onApply={applyTrend} />
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
        <div className={common.tile}>
          <label className={styles.check}>
            <input type="checkbox" checked={profile.macro !== null} onChange={(e) => toggleMacro(e.target.checked)} />
            {t('nutrition.cal.macroCustom')}
          </label>
          {profile.macro && <MacroPanel spec={profile.macro} targets={targets} weightKg={weightKg} kpg={kpg} onChange={(m) => setProfile({ ...profile, macro: m })} />}
          {macroWarnings.map((w) => (
            <p key={w} className={common.note} role="status">
              {t(`nutrition.cal.warn.${w}`, {
                n:
                  w === 'protein_low_cut'
                    ? dietSettings.cutMinProteinPerKg
                    : w === 'protein_low'
                      ? dietSettings.minProteinPerKg
                      : w === 'protein_very_high'
                        ? dietSettings.maxProteinPerKg
                        : w === 'fat_low'
                          ? dietSettings.minFatPerKg
                          : dietSettings.maxFatPercent,
                kcal: Math.round(specTargets?.overflowKcal ?? 0),
              })}
            </p>
          ))}
        </div>
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

      <section className={common.section}>
        <details className={common.disclosure}>
          <summary>
            {t('nutrition.cal.splitTitle')}
            <Icon name="chevronDown" />
          </summary>
          <div className={common.disclosureBody}>
            <SplitPanel
              slots={slots}
              kcal={targets.kcal}
              preset={profile.split}
              workoutTime={profile.workoutTime}
              onPreset={(p) => setProfile({ ...profile, split: p, shares: null, workoutTime: p === 'workout' && profile.workoutTime === null ? '17:00' : profile.workoutTime })}
              onShares={(sh) => setProfile({ ...profile, split: 'custom', shares: sh })}
              onWorkout={(time) => setProfile({ ...profile, workoutTime: time })}
            />
          </div>
        </details>
        <details className={common.disclosure}>
          <summary>
            {t('nutrition.cal.cycleTitle')}
            <Icon name="chevronDown" />
          </summary>
          <div className={common.disclosureBody}>
            <CyclePanel
              cycle={profile.cycle}
              extraKcal={extraKcal}
              types={dayTypes}
              days={cycle.days}
              averageKcal={cycle.averageKcal}
              targetKcal={targets.kcal}
              onChange={(c) => setProfile({ ...profile, cycle: c })}
            />
          </div>
        </details>
        <div className={`${common.tile} ${cal.panel}`}>
          <h2 className={common.sectionTitle}>{t('nutrition.cal.prefsTitle')}</h2>
          <p className={common.caption}>
            {prefsCount === 0 ? t('nutrition.cal.prefsNone') : t('nutrition.cal.prefsSummary', { blocked: exclude.size, loves: profile.prefs.loves.length })}
          </p>
          <div className={common.actions}>
            <Button variant="secondary" icon="settings" onClick={() => setShowPrefs(true)}>
              {t('nutrition.cal.prefsOpen')}
            </Button>
          </div>
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
          targets={liveDayTargets}
          slots={live.slots}
          dayTypes={live.dayTargets ? dayTypes : null}
          water={water.ok ? water.value : null}
          options={{ goal: live.goal, style: live.style, vegetarian: live.vegetarian, exclude: live.exclude, boost: live.boost }}
          ds={dietSettings}
          noteKeys={noteKeys}
          onSaved={() => navigate(`/clients/${client.id}/meals`, { replace: true })}
        />
      )}

      {showPrefs && <PrefsSheet prefs={profile.prefs} foods={foods} onChange={(p) => setProfile({ ...profile, prefs: p })} onClose={() => setShowPrefs(false)} />}

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
