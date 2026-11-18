import type { DietSettings } from './dietSettings';

export const DIET_SCHEDULES = ['normal', 'if_16_8', 'ramadan'] as const;
export type DietSchedule = (typeof DIET_SCHEDULES)[number];

export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Display name of a slot (i18n key under nutrition.diet.slot). */
export type SlotLabel = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'iftar' | 'suhoor' | 'firstMeal' | 'meal' | 'lastMeal';

export interface DietSlot {
  label: SlotLabel;
  /** What kind of dish fits here (decides which recipes are tried). */
  kind: MealKind;
  /** "HH:MM", 24 h. */
  time: string;
  /** Share of the day's calories, integers summing to 100 across the day. */
  sharePercent: number;
  /** Carbs weight around training (1 = the meal's plain share; above 1 = more carbs, fat gives way). */
  carbWeight?: number;
}

export type MealsPerDay = 3 | 4 | 5;

type Row = readonly [SlotLabel, MealKind, string, number];

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const NORMAL: Record<MealsPerDay, readonly Row[]> = {
  3: [['breakfast', 'breakfast', '08:00', 30], ['lunch', 'lunch', '14:00', 40], ['dinner', 'dinner', '20:00', 30]],
  4: [['breakfast', 'breakfast', '08:00', 25], ['lunch', 'lunch', '14:00', 35], ['snack', 'snack', '17:00', 15], ['dinner', 'dinner', '20:30', 25]],
  5: [['breakfast', 'breakfast', '08:00', 20], ['snack', 'snack', '11:00', 10], ['lunch', 'lunch', '14:00', 30], ['snack', 'snack', '17:00', 15], ['dinner', 'dinner', '20:30', 25]],
};

/** Offsets in minutes from the start of the 8-hour window. */
const IF: Record<MealsPerDay, readonly [SlotLabel, MealKind, number, number][]> = {
  3: [['firstMeal', 'lunch', 0, 40], ['snack', 'snack', 240, 20], ['lastMeal', 'dinner', 480, 40]],
  4: [['firstMeal', 'lunch', 0, 35], ['snack', 'snack', 180, 15], ['meal', 'dinner', 330, 20], ['lastMeal', 'snack', 480, 30]],
  5: [['firstMeal', 'lunch', 0, 30], ['snack', 'snack', 120, 10], ['meal', 'dinner', 240, 25], ['snack', 'snack', 360, 10], ['lastMeal', 'dinner', 480, 25]],
};

/** Offsets in minutes after iftar (suhoor is placed by its own time). */
const RAMADAN: Record<MealsPerDay, readonly [SlotLabel, MealKind, number | 'suhoor', number][]> = {
  3: [['iftar', 'lunch', 0, 50], ['snack', 'snack', 210, 15], ['suhoor', 'breakfast', 'suhoor', 35]],
  4: [['iftar', 'lunch', 0, 40], ['meal', 'dinner', 150, 25], ['snack', 'snack', 270, 10], ['suhoor', 'breakfast', 'suhoor', 25]],
  5: [['iftar', 'lunch', 0, 35], ['meal', 'dinner', 150, 20], ['snack', 'snack', 270, 10], ['snack', 'snack', 420, 10], ['suhoor', 'breakfast', 'suhoor', 25]],
};

/**
 * The day's meal layout: names, times and calorie shares. Intermittent fasting keeps every meal inside an
 * 8-hour window; Ramadan has iftar first and suhoor last (suhoor time is after midnight).
 */
export function slotsFor(schedule: DietSchedule, mealsPerDay: MealsPerDay, ds: DietSettings): DietSlot[] {
  if (schedule === 'normal') return NORMAL[mealsPerDay].map(([label, kind, time, sharePercent]) => ({ label, kind, time, sharePercent }));
  if (schedule === 'if_16_8') {
    const start = toMinutes(ds.ifWindowStart);
    return IF[mealsPerDay].map(([label, kind, offset, sharePercent]) => ({ label, kind, time: toTime(start + offset), sharePercent }));
  }
  const iftar = toMinutes(ds.iftarTime);
  return RAMADAN[mealsPerDay].map(([label, kind, offset, sharePercent]) => ({
    label,
    kind,
    time: offset === 'suhoor' ? ds.suhoorTime : toTime(iftar + offset),
    sharePercent,
  }));
}
