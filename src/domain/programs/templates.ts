import type { ExerciseId, ProgramDay, ProgramItem } from '../models';
import { normalizeSupersets } from './supersets';
import type { LocalIdFactory, ProgramBody } from './types';

/**
 * Built-in program templates (SPEC: Push/Pull/Legs, Upper/Lower, Full Body). Pure data: exercise ids are
 * ids of the bundled pack (public/exercise-pack/exercises.json; a test checks they exist). Names are NOT
 * here — the UI looks them up as i18n keys by `id` and day `key`, so the trainer sees the dictionary
 * transliterations (بوش، بول، ليجز…).
 */
export type BuiltinTemplateId = 'ppl' | 'upper_lower' | 'full_body';

export interface TemplateItem {
  exerciseId: string;
  sets: number;
  reps: string;
  restSec: number;
  tempo?: string;
  rpe?: number;
  /** Items with the same label next to each other form a superset. */
  superset?: string;
}

export interface TemplateDay {
  key: string;
  items: readonly TemplateItem[];
}

export interface BuiltinTemplate {
  id: BuiltinTemplateId;
  days: readonly TemplateDay[];
}

const it = (exerciseId: string, sets: number, reps: string, restSec: number, extra: Partial<TemplateItem> = {}): TemplateItem => ({
  exerciseId,
  sets,
  reps,
  restSec,
  ...extra,
});

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    id: 'ppl',
    days: [
      {
        key: 'push',
        items: [
          it('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 150, { rpe: 8 }),
          it('Incline_Dumbbell_Press', 3, '8-10', 120),
          it('Dumbbell_Shoulder_Press', 3, '8-10', 90),
          it('Side_Lateral_Raise', 3, '12-15', 60, { superset: 'A' }),
          it('Triceps_Pushdown_-_Rope_Attachment', 3, '12', 60, { superset: 'A' }),
        ],
      },
      {
        key: 'pull',
        items: [
          it('Pullups', 4, '6-8', 150),
          it('Bent_Over_Barbell_Row', 3, '8-10', 120, { rpe: 8 }),
          it('Seated_Cable_Rows', 3, '10-12', 90),
          it('Face_Pull', 3, '15', 60, { superset: 'A' }),
          it('Hammer_Curls', 3, '10-12', 60, { superset: 'A' }),
        ],
      },
      {
        key: 'legs',
        items: [
          it('Barbell_Squat', 4, '6-8', 180, { tempo: '3-1-1-0', rpe: 8 }),
          it('Romanian_Deadlift', 3, '8-10', 120, { tempo: '3-0-1-0' }),
          it('Leg_Press', 3, '10-12', 120),
          it('Lying_Leg_Curls', 3, '12', 60, { superset: 'A' }),
          it('Leg_Extensions', 3, '12', 60, { superset: 'A' }),
          it('Standing_Calf_Raises', 4, '12-15', 60),
        ],
      },
    ],
  },
  {
    id: 'upper_lower',
    days: [
      {
        key: 'upper',
        items: [
          it('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 150, { rpe: 8 }),
          it('Bent_Over_Barbell_Row', 4, '6-8', 150),
          it('Dumbbell_Shoulder_Press', 3, '8-10', 90),
          it('Wide-Grip_Lat_Pulldown', 3, '10-12', 90),
          it('Dumbbell_Bicep_Curl', 3, '10-12', 60, { superset: 'A' }),
          it('Triceps_Pushdown', 3, '10-12', 60, { superset: 'A' }),
        ],
      },
      {
        key: 'lower',
        items: [
          it('Barbell_Squat', 4, '6-8', 180, { rpe: 8 }),
          it('Barbell_Hip_Thrust', 3, '8-10', 120, { tempo: '2-1-1-0' }),
          it('Romanian_Deadlift', 3, '8-10', 120),
          it('Dumbbell_Lunges', 3, '10', 90),
          it('Seated_Calf_Raise', 4, '12-15', 60),
        ],
      },
    ],
  },
  {
    id: 'full_body',
    days: [
      {
        key: 'full',
        items: [
          it('Goblet_Squat', 3, '10-12', 90),
          it('Push-Ups_With_Feet_Elevated', 3, '10', 60),
          it('One-Arm_Dumbbell_Row', 3, '10-12', 60),
          it('Barbell_Glute_Bridge', 3, '12', 60),
          it('Side_Lateral_Raise', 2, '15', 45, { superset: 'A' }),
          it('Plank', 2, '30s', 45, { superset: 'A' }),
        ],
      },
    ],
  },
];

export function builtinTemplate(id: BuiltinTemplateId): BuiltinTemplate {
  const template = BUILTIN_TEMPLATES.find((tpl) => tpl.id === id);
  if (!template) throw new Error(`unknown template ${id}`);
  return template;
}

function toItem(source: TemplateItem, newId: LocalIdFactory): ProgramItem {
  return {
    id: newId(),
    exerciseId: source.exerciseId as ExerciseId,
    sets: source.sets,
    reps: source.reps,
    restSec: source.restSec,
    tempo: source.tempo ?? '',
    rpe: source.rpe ?? null,
    supersetGroup: source.superset ?? null,
    notes: '',
  };
}

/**
 * A program body from a template. `dayName(key)` supplies each day's (translated) name; the result is not a
 * template itself unless `asTemplate` is set.
 */
export function instantiateTemplate(
  template: BuiltinTemplate,
  options: { name: string; dayName: (key: string) => string; newId: LocalIdFactory; clientId?: ProgramBody['clientId']; asTemplate?: boolean },
): ProgramBody {
  const days: ProgramDay[] = template.days.map((day) => ({
    id: options.newId(),
    name: options.dayName(day.key),
    items: normalizeSupersets(day.items.map((source) => toItem(source, options.newId))),
  }));
  return { name: options.name, clientId: options.clientId ?? null, isTemplate: options.asTemplate ?? false, days, notes: '' };
}

/** Every exercise id used by the built-in templates (for the pack-consistency test). */
export function templateExerciseIds(): string[] {
  return [...new Set(BUILTIN_TEMPLATES.flatMap((tpl) => tpl.days.flatMap((d) => d.items.map((i) => i.exerciseId))))];
}
