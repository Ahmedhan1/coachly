import { dateAfterWeeks, rateFromKcal, realisticTarget, realisticWeeks, type BodyNow, type GoalPlanCoefficients, type PlanGoal } from '@/domain/nutrition';
import { bmrCoefficientsFrom, type DietProfile, type GoalDiet, type NutritionSettings } from '@/domain/meals';
import { t } from '@/i18n';
import { Button, Chip, LineChart, Select, Tx } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { Slider } from '../shared/Slider';
import common from '../shared/common.module.css';
import styles from './Cal.module.css';

type PlanState = DietProfile['plan'];

interface Props {
  body: BodyNow;
  goal: PlanGoal;
  state: PlanState;
  diet: GoalDiet;
  coeffs: GoalPlanCoefficients;
  settings: NutritionSettings;
  /** Today (passed in; the domain never reads the clock). */
  now: Date;
  /** 'navy' = estimated from neck/waist(/hip) measurements. */
  bodyFatSource: 'given' | 'navy' | null;
  onChange: (state: PlanState) => void;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Live "what if": target weight, weeks, weekly rate, calories and protein move together. */
export function GoalPanel({ body, goal, state, diet, coeffs, settings, now, bodyFatSource, onChange }: Props) {
  const { plan, macros, targetWeightKg } = diet;
  const w0 = body.weightKg;
  const moving = goal === 'cut' || goal === 'bulk';
  const diff = targetWeightKg - w0;
  const weeksFor = (rate: number) => Math.max(1, Math.min(260, Math.round(Math.abs(diff) / Math.max(0.01, Math.abs(rate)))));
  const endDate = dateAfterWeeks(state.weeks, now);
  const input = { body, goal, targetWeightKg, weeks: state.weeks, experience: state.experience };
  const bc = bmrCoefficientsFrom(settings);
  const unsafe = plan.flags.filter((f) => f !== 'wrong_direction');
  const fixWeeks = moving && unsafe.length > 0 ? realisticWeeks(input, coeffs, bc) : null;
  const fixTarget = moving && unsafe.length > 0 ? realisticTarget(input, coeffs, bc) : null;
  const flagN = (f: (typeof plan.flags)[number]) =>
    f === 'loss_too_fast' ? coeffs.maxLossPercentPerWeek : f === 'gain_too_fast' ? coeffs.gainCapPercentPerMonth[state.experience] : f === 'below_floor' ? Math.round(plan.floorKcal) : 0;
  const series = plan.projection.map((p) => ({ date: dateAfterWeeks(p.week, now), value: r1(p.weightKg) }));
  const tMin = goal === 'cut' ? Math.floor(w0 * 0.7) : Math.floor(w0);
  const tMax = goal === 'bulk' ? Math.ceil(w0 * 1.25) : Math.ceil(w0);
  return (
    <div className={styles.panel}>
      <p className={styles.rowSub}>{t('nutrition.goal.hint')}</p>
      <p className={styles.rowSub}>
        <Tx k="nutrition.goal.body" params={{ w: r1(w0), h: Math.round(body.heightCm), a: Math.round(body.ageYears) }} />
        {' · '}
        {body.bodyFatPercent !== null ? <Tx k="nutrition.goal.bodyFat" params={{ bf: r1(body.bodyFatPercent) }} /> : t('nutrition.goal.bodyFatUnknown')}
      </p>
      {bodyFatSource === 'navy' && <p className={styles.rowSub}>{t('nutrition.goal.bodyFatNavy')}</p>}
      <Select
        label={t('nutrition.goal.experience')}
        value={state.experience}
        onChange={(v) => onChange({ ...state, experience: v })}
        options={(['beginner', 'intermediate', 'advanced'] as const).map((e) => ({ value: e, label: t(`nutrition.goal.exp.${e}`) }))}
      />
      {moving && (
        <>
          <Slider
            label={t('nutrition.goal.target')}
            value={targetWeightKg}
            min={tMin}
            max={tMax}
            step={0.5}
            onChange={(v) => onChange({ ...state, targetWeightKg: v })}
            display={t('nutrition.goal.kg', { n: r1(targetWeightKg) })}
          />
          <Slider label={t('nutrition.goal.weeks')} value={state.weeks} min={1} max={104} step={1} onChange={(v) => onChange({ ...state, weeks: v })} display={t('nutrition.goal.weeksValue', { n: state.weeks })} />
          <Slider
            label={t('nutrition.goal.rate')}
            value={r2(plan.rateKgPerWeek)}
            min={goal === 'cut' ? -1.5 : 0.05}
            max={goal === 'cut' ? -0.1 : 1}
            step={0.05}
            onChange={(v) => diff !== 0 && onChange({ ...state, weeks: weeksFor(v) })}
            display={t('nutrition.goal.rateValue', { kg: signed(r2(plan.rateKgPerWeek)) })}
          />
          <Slider
            label={t('nutrition.goal.kcal')}
            value={Math.round(plan.kcal / 10) * 10}
            min={Math.round((plan.tdee - 1200) / 10) * 10}
            max={Math.round((plan.tdee + 1200) / 10) * 10}
            step={10}
            onChange={(k) => {
              const rate = rateFromKcal(k, plan.tdee, coeffs);
              if (diff !== 0 && Math.sign(rate) === Math.sign(diff) && Math.abs(rate) > 0.01) onChange({ ...state, weeks: weeksFor(rate) });
            }}
            display={String(Math.round(plan.kcal))}
          />
        </>
      )}
      <Slider
        label={t('nutrition.goal.protein')}
        value={r1(macros.perKg)}
        min={1.2}
        max={3.5}
        step={0.1}
        onChange={(v) => onChange({ ...state, proteinPerKg: v })}
        display={t('nutrition.goal.proteinValue', { n: r1(macros.perKg) })}
      />
      <div className={styles.suggest} role="status" aria-live="polite">
        <p>
          {moving
            ? t('nutrition.goal.summary', { kcal: Math.round(plan.kcal), p: Math.round(macros.proteinG), w: r1(targetWeightKg), date: formatIsoDate(endDate) })
            : t('nutrition.goal.summaryHold', { kcal: Math.round(plan.kcal), p: Math.round(macros.proteinG) })}
        </p>
      </div>
      {moving && (
        <p className={styles.rowSub}>
          <Tx
            k="nutrition.goal.rateLine"
            params={{ kg: signed(r2(plan.rateKgPerWeek)), pct: signed(r2(plan.ratePercentPerWeek)), delta: signed(Math.round(plan.dailyDeltaKcal)), tdee: Math.round(plan.tdee) }}
          />
        </p>
      )}
      <p className={styles.rowSub}>
        {t(body.bodyFatPercent !== null && settings.preferKatchWhenBodyFat ? 'nutrition.goal.formula.katch' : 'nutrition.goal.formula.mifflin', { bmr: Math.round(plan.bmr) })}
      </p>
      <p className={styles.rowName}>
        {state.proteinPerKg !== null ? t('nutrition.goal.custom') : t(`nutrition.goal.why.${macros.reason}`, { n: r1(macros.perKg), ref: r1(macros.refKg) })}
      </p>
      {state.proteinPerKg === null && macros.basis === 'adjusted' && <p className={styles.rowSub}>{t('nutrition.goal.adjusted')}</p>}
      {state.proteinPerKg === null && macros.age50 && <p className={styles.rowSub}>{t('nutrition.goal.age50')}</p>}
      {state.proteinPerKg !== null && (
        <Chip onClick={() => onChange({ ...state, proteinPerKg: null })}>
          {t('nutrition.goal.proteinReset')}
        </Chip>
      )}
      {plan.flags.map((f) => (
        <p key={f} className={common.note} role="status">
          {t(`nutrition.goal.flag.${f}`, { n: flagN(f) })}
        </p>
      ))}
      {(fixWeeks !== null || (fixTarget !== null && fixTarget !== targetWeightKg)) && (
        <div className={common.actions}>
          {fixWeeks !== null && (
            <Button variant="secondary" onClick={() => onChange({ ...state, weeks: fixWeeks })}>
              {t('nutrition.goal.fixDate', { n: fixWeeks, date: formatIsoDate(dateAfterWeeks(fixWeeks, now)) })}
            </Button>
          )}
          {fixTarget !== null && fixTarget !== targetWeightKg && (
            <Button variant="secondary" onClick={() => onChange({ ...state, targetWeightKg: fixTarget })}>
              {t('nutrition.goal.fixTarget', { kg: fixTarget })}
            </Button>
          )}
        </div>
      )}
      {moving && plan.phases.length > 1 && (
        <>
          <p className={styles.rowName}>{t('nutrition.goal.phasesTitle')}</p>
          <ul className={styles.phaseList}>
            {plan.phases.map((p) => (
              <li key={p.fromWeek}>
                <Tx k="nutrition.goal.phase" params={{ from: p.fromWeek, to: p.toWeek, kcal: p.kcal }} />
              </li>
            ))}
          </ul>
        </>
      )}
      {moving && series.length > 1 && (
        <LineChart
          series={series}
          label={t('nutrition.goal.chartLabel')}
          formatValue={(v) => t('nutrition.goal.kg', { n: r1(v) })}
          formatDate={formatIsoDate}
          dateHeader={t('nutrition.goal.chartDate')}
          valueHeader={t('nutrition.goal.chartValue')}
          height={160}
        />
      )}
    </div>
  );
}
