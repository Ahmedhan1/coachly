import { ageInYears, defaultFormulaFor, type CalcInput, type NutritionSettings, type SavedCalculation } from '@/domain/meals';
import { toIsoDate, type Client, type ProgressEntry } from '@/domain/models';
import { fieldText } from '../shared/numbers';

/** Form state: numbers stay as the text the trainer typed until they are parsed. */
export interface CalcDraft {
  sex: CalcInput['sex'];
  age: string;
  height: string;
  weight: string;
  bodyFat: string;
  formula: CalcInput['formula'];
  activity: CalcInput['activity'];
  goal: CalcInput['goal'];
  goalPercent: number;
  proteinPerKg: number;
  fatPerKg: number;
}

/** Which fields were filled from the client file (shown as a hint). */
export interface Prefill {
  fromSaved: boolean;
  fromClient: boolean;
}

const goalOf = (client: Client): CalcInput['goal'] =>
  client.goal === 'fat_loss' ? 'cut' : client.goal === 'muscle_gain' ? 'bulk' : 'maintain';

/** Initial draft: the last saved calculation, else the client's file (latest check-in wins for weight/body fat). */
export function initialDraft(client: Client, saved: SavedCalculation | null, latest: ProgressEntry | undefined, s: NutritionSettings, now: Date): { draft: CalcDraft; prefill: Prefill } {
  if (saved) {
    const i = saved.input;
    return {
      draft: {
        sex: i.sex,
        age: fieldText(i.ageYears),
        height: fieldText(i.heightCm),
        weight: fieldText(i.weightKg),
        bodyFat: fieldText(i.bodyFatPercent),
        formula: i.formula,
        activity: i.activity,
        goal: i.goal,
        goalPercent: i.goalPercent,
        proteinPerKg: i.proteinPerKg,
        fatPerKg: i.fatPerKg,
      },
      prefill: { fromSaved: true, fromClient: false },
    };
  }
  const m = client.measurements;
  const weight = latest?.measurements.weightKg ?? m.weightKg;
  const bodyFat = latest?.measurements.bodyFatPercent ?? m.bodyFatPercent;
  const height = m.heightCm ?? latest?.measurements.heightCm;
  const goal = goalOf(client);
  return {
    draft: {
      sex: client.gender ?? 'male',
      age: fieldText(ageInYears(client.birthDate, toIsoDate(now))),
      height: fieldText(height),
      weight: fieldText(weight),
      bodyFat: fieldText(bodyFat),
      formula: defaultFormulaFor(bodyFat, s),
      activity: s.defaultActivity,
      goal,
      goalPercent: goal === 'bulk' ? s.defaultGoalPercent.bulk : s.defaultGoalPercent.cut,
      proteinPerKg: s.defaultProteinPerKg,
      fatPerKg: s.defaultFatPerKg,
    },
    prefill: { fromSaved: false, fromClient: weight !== undefined || height !== undefined || client.birthDate !== null },
  };
}

/** Text → number for the calculator. Empty body fat means "unknown" (null). */
export function draftToInput(d: CalcDraft, parse: (s: string) => number): CalcInput {
  const bf = d.bodyFat.trim() === '' ? null : parse(d.bodyFat);
  return {
    sex: d.sex,
    ageYears: parse(d.age),
    heightCm: parse(d.height),
    weightKg: parse(d.weight),
    bodyFatPercent: bf,
    formula: d.formula,
    activity: d.activity,
    goal: d.goal,
    goalPercent: d.goal === 'maintain' ? 0 : d.goalPercent,
    proteinPerKg: d.proteinPerKg,
    fatPerKg: d.fatPerKg,
  };
}

/** Keeps the goal slider inside the trainer's range when the goal changes. */
export function clampGoalPercent(goal: CalcInput['goal'], percent: number, s: NutritionSettings): number {
  if (goal === 'maintain') return percent;
  const r = s.goalRanges[goal];
  if (percent >= r.min && percent <= r.max) return percent;
  return s.defaultGoalPercent[goal] >= r.min && s.defaultGoalPercent[goal] <= r.max ? s.defaultGoalPercent[goal] : r.min;
}

export type BodyField = 'age' | 'height' | 'weight' | 'bodyFat';

/** First required body field the trainer left empty (age, height, weight), or null. */
export function missingField(d: CalcDraft): Exclude<BodyField, 'bodyFat'> | null {
  for (const f of ['age', 'height', 'weight'] as const) if (d[f].trim() === '') return f;
  return null;
}

/** Which input a calculator error points at, so the field itself can show it. */
export function fieldOfError(error: string): BodyField | null {
  if (error === 'invalid_age') return 'age';
  if (error === 'invalid_height') return 'height';
  if (error === 'invalid_weight') return 'weight';
  if (error === 'invalid_body_fat' || error === 'missing_body_fat') return 'bodyFat';
  return null;
}
