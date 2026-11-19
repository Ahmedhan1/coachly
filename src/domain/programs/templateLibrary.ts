import type { BuiltinTemplate, TemplateItem } from './templates';

/**
 * More ready templates for common client types. Pure data, same rules as the first three (ids from the
 * bundled pack, names as i18n keys). The prescriptions follow the evidence summarised in docs/PROGRAMS.md:
 * every major muscle at least twice a week where the split allows, ~10+ hard sets per muscle per week for
 * muscle gain, ~3-6 heavy reps with long rests for strength, 90 s+ between sets on compound lifts, and
 * machine-first, lower-volume work for older or deconditioned clients. They are starting points: the trainer
 * edits sets, reps, rest and exercises for the client in the program builder.
 */
export type LibraryTemplateId =
  | 'beginner_ab'
  | 'strength_ab'
  | 'bro_split'
  | 'glutes_focus'
  | 'home_dumbbells'
  | 'bodyweight'
  | 'fat_loss_circuit'
  | 'older_adults'
  | 'kettlebell';

const it = (exerciseId: string, sets: number, reps: string, restSec: number, extra: Partial<TemplateItem> = {}): TemplateItem => ({
  exerciseId,
  sets,
  reps,
  restSec,
  ...extra,
});

export const LIBRARY_TEMPLATES: readonly (BuiltinTemplate & { id: LibraryTemplateId })[] = [
  {
    // New to the gym: two whole-body days alternated A-B-A / B-A-B, mostly machines, 2-3 sets of 10-12.
    id: 'beginner_ab',
    days: [
      {
        key: 'begin_a',
        items: [
          it('Leg_Press', 3, '10-12', 120, { rpe: 7 }),
          it('Machine_Bench_Press', 3, '10-12', 90, { rpe: 7 }),
          it('Seated_Cable_Rows', 3, '10-12', 90),
          it('Stiff-Legged_Dumbbell_Deadlift', 2, '10-12', 90, { tempo: '3-0-1-0' }),
          it('Side_Lateral_Raise', 2, '12-15', 60),
          it('Plank', 2, '30s', 45),
        ],
      },
      {
        key: 'begin_b',
        items: [
          it('Goblet_Squat', 3, '10-12', 90, { rpe: 7 }),
          it('Wide-Grip_Lat_Pulldown', 3, '10-12', 90),
          it('Machine_Shoulder_Military_Press', 3, '10-12', 90),
          it('Seated_Leg_Curl', 2, '10-12', 60),
          it('Incline_Push-Up', 2, '10-12', 60),
          it('Dead_Bug', 2, '10', 45),
        ],
      },
    ],
  },
  {
    // Strength: heavy compounds (~80%+ 1RM), few reps, long rests; two days alternated 3x a week.
    id: 'strength_ab',
    days: [
      {
        key: 'strength_a',
        items: [
          it('Barbell_Squat', 5, '5', 180, { rpe: 8 }),
          it('Barbell_Bench_Press_-_Medium_Grip', 5, '5', 180, { rpe: 8 }),
          it('Bent_Over_Barbell_Row', 4, '6', 150, { rpe: 8 }),
          it('Plank', 3, '45s', 60),
        ],
      },
      {
        key: 'strength_b',
        items: [
          it('Barbell_Deadlift', 3, '5', 240, { rpe: 8 }),
          it('Standing_Military_Press', 4, '5', 180, { rpe: 8 }),
          it('Pullups', 4, '6', 150),
          it('Barbell_Hip_Thrust', 3, '8', 120),
          it('Ab_Roller', 3, '10', 60),
        ],
      },
    ],
  },
  {
    // Classic 5-day body-part split: each muscle once a week with high per-session volume.
    id: 'bro_split',
    days: [
      {
        key: 'chest',
        items: [
          it('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 150, { rpe: 8 }),
          it('Incline_Dumbbell_Press', 3, '8-10', 120),
          it('Dips_-_Chest_Version', 3, '8-12', 90),
          it('Cable_Crossover', 3, '12-15', 60),
          it('Incline_Cable_Flye', 2, '12-15', 60),
        ],
      },
      {
        key: 'back',
        items: [
          it('Pullups', 4, '6-10', 150),
          it('Bent_Over_Barbell_Row', 4, '8', 120, { rpe: 8 }),
          it('One-Arm_Dumbbell_Row', 3, '10', 90),
          it('Close-Grip_Front_Lat_Pulldown', 3, '10-12', 90),
          it('Hyperextensions_Back_Extensions', 3, '12', 60),
        ],
      },
      {
        key: 'shoulders',
        items: [
          it('Standing_Military_Press', 4, '6-8', 150, { rpe: 8 }),
          it('Side_Lateral_Raise', 4, '12-15', 60),
          it('Cable_Rear_Delt_Fly', 3, '15', 60, { superset: 'A' }),
          it('Face_Pull', 3, '15', 60, { superset: 'A' }),
          it('Dumbbell_Shrug', 3, '12', 60),
        ],
      },
      {
        key: 'arms',
        items: [
          it('EZ-Bar_Curl', 3, '8-10', 75, { superset: 'A' }),
          it('Close-Grip_Barbell_Bench_Press', 3, '8-10', 75, { superset: 'A' }),
          it('Incline_Dumbbell_Curl', 3, '10-12', 60, { superset: 'B' }),
          it('Cable_Rope_Overhead_Triceps_Extension', 3, '10-12', 60, { superset: 'B' }),
          it('Hammer_Curls', 2, '12', 60, { superset: 'C' }),
          it('Triceps_Pushdown_-_Rope_Attachment', 2, '12-15', 60, { superset: 'C' }),
        ],
      },
      {
        key: 'legs',
        items: [
          it('Barbell_Squat', 4, '6-8', 180, { rpe: 8 }),
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
    // Lower-body / glute emphasis, 4 days: glutes twice a week from different angles, upper body twice.
    id: 'glutes_focus',
    days: [
      {
        key: 'glutes_ham',
        items: [
          it('Barbell_Hip_Thrust', 4, '8-10', 120, { tempo: '2-1-1-0', rpe: 8 }),
          it('Romanian_Deadlift', 3, '8-10', 120, { tempo: '3-0-1-0' }),
          it('pt_Cable_Upright_Kickback', 3, '12-15', 60),
          it('Seated_Leg_Curl', 3, '10-12', 60),
          it('Thigh_Abductor', 3, '15-20', 45),
        ],
      },
      {
        key: 'upper_a',
        items: [
          it('Dumbbell_Bench_Press', 3, '8-10', 90),
          it('Wide-Grip_Lat_Pulldown', 3, '10-12', 90),
          it('Side_Lateral_Raise', 3, '12-15', 60, { superset: 'A' }),
          it('Face_Pull', 3, '15', 60, { superset: 'A' }),
          it('Triceps_Pushdown', 2, '12', 60),
        ],
      },
      {
        key: 'glutes_quads',
        items: [
          it('Smith_Machine_Squat', 4, '8-10', 150, { rpe: 8 }),
          it('pt_Dumbbell_Bulgarian_Split_Squat', 3, '10', 90),
          it('Leg_Press', 3, '12', 90),
          it('Pull_Through', 3, '12-15', 60),
          it('Leg_Extensions', 2, '15', 60),
        ],
      },
      {
        key: 'upper_b',
        items: [
          it('Machine_Shoulder_Military_Press', 3, '10', 90),
          it('Seated_Cable_Rows', 3, '10-12', 90),
          it('Incline_Dumbbell_Press', 3, '10', 90),
          it('Dumbbell_Bicep_Curl', 2, '12', 60, { superset: 'A' }),
          it('Plank', 2, '30s', 60, { superset: 'A' }),
        ],
      },
    ],
  },
  {
    // A pair of dumbbells at home: two whole-body days, every exercise home-friendly.
    id: 'home_dumbbells',
    days: [
      {
        key: 'home_a',
        items: [
          it('Goblet_Squat', 3, '10-12', 90),
          it('Dumbbell_Floor_Press', 3, '8-12', 90),
          it('One-Arm_Dumbbell_Row', 3, '10-12', 75),
          it('Stiff-Legged_Dumbbell_Deadlift', 3, '10-12', 90, { tempo: '3-0-1-0' }),
          it('Side_Lateral_Raise', 2, '12-15', 45, { superset: 'A' }),
          it('Dead_Bug', 2, '10', 45, { superset: 'A' }),
        ],
      },
      {
        key: 'home_b',
        items: [
          it('Dumbbell_Lunges', 3, '10', 90),
          it('Dumbbell_Shoulder_Press', 3, '8-10', 90),
          it('Bent_Over_Two-Dumbbell_Row', 3, '10-12', 75),
          it('Single_Leg_Glute_Bridge', 3, '12', 60),
          it('Hammer_Curls', 2, '12', 45, { superset: 'A' }),
          it('Tricep_Dumbbell_Kickback', 2, '12', 45, { superset: 'A' }),
        ],
      },
    ],
  },
  {
    // No equipment beyond a bench/chair and a suspension strap: progress by reps, tempo and harder variations.
    id: 'bodyweight',
    days: [
      {
        key: 'bw_a',
        items: [
          it('Bodyweight_Squat', 3, '15-20', 60, { tempo: '3-1-1-0' }),
          it('Pushups', 3, '8-15', 60),
          it('Inverted_Row_with_Straps', 3, '8-12', 60),
          it('Single_Leg_Glute_Bridge', 3, '12', 45),
          it('Glute_Kickback', 2, '15', 45),
          it('Plank', 3, '30s', 45),
        ],
      },
      {
        key: 'bw_b',
        items: [
          it('pt_Bodyweight_Bulgarian_Split_Squat', 3, '10', 60),
          it('Push-Ups_-_Close_Triceps_Position', 3, '8-12', 60),
          it('Bench_Dips', 3, '10-15', 60),
          it('pt_Glute_Bridge_March', 3, '12', 45),
          it('Side_Bridge', 2, '30s', 45),
          it('Mountain_Climbers', 3, '30s', 45),
        ],
      },
    ],
  },
  {
    // Fat loss: resistance training keeps muscle in a calorie deficit; paired moves with short rest keep
    // the session dense. Diet does the fat loss — this is the training side.
    id: 'fat_loss_circuit',
    days: [
      {
        key: 'circuit_a',
        items: [
          it('Goblet_Squat', 3, '12-15', 30, { superset: 'A' }),
          it('Pushups', 3, '10-15', 60, { superset: 'A' }),
          it('Stiff-Legged_Dumbbell_Deadlift', 3, '12', 30, { superset: 'B' }),
          it('Seated_Cable_Rows', 3, '12-15', 60, { superset: 'B' }),
          it('Dumbbell_Lunges', 3, '10', 30, { superset: 'C' }),
          it('Mountain_Climbers', 3, '30s', 60, { superset: 'C' }),
        ],
      },
      {
        key: 'circuit_b',
        items: [
          it('Leg_Press', 3, '15', 30, { superset: 'A' }),
          it('Machine_Shoulder_Military_Press', 3, '12', 60, { superset: 'A' }),
          it('pt_Kettlebell_Swing', 3, '15', 30, { superset: 'B' }),
          it('Wide-Grip_Lat_Pulldown', 3, '12', 60, { superset: 'B' }),
          it('pt_Burpee', 3, '10', 30, { superset: 'C' }),
          it('Plank', 3, '30s', 60, { superset: 'C' }),
        ],
      },
    ],
  },
  {
    // Older or deconditioned clients: machines first, 2 sets of 10-12 at a moderate effort, plus a step-up and
    // a loaded carry for balance and daily function. Build to 3 sets as the client adapts.
    id: 'older_adults',
    days: [
      {
        key: 'older_a',
        items: [
          it('Leg_Press', 2, '10-12', 120, { rpe: 6 }),
          it('Machine_Bench_Press', 2, '10-12', 90, { rpe: 6 }),
          it('Seated_Cable_Rows', 2, '10-12', 90, { rpe: 6 }),
          it('Seated_Leg_Curl', 2, '10-12', 90),
          it('pt_Box_Step_Up', 2, '8', 90),
          it('Seated_Calf_Raise', 2, '12', 60),
        ],
      },
      {
        key: 'older_b',
        items: [
          it('Leg_Extensions', 2, '10-12', 90, { rpe: 6 }),
          it('Machine_Shoulder_Military_Press', 2, '10-12', 90, { rpe: 6 }),
          it('Leverage_High_Row', 2, '10-12', 90),
          it('Thigh_Abductor', 2, '12', 60),
          it('Pallof_Press', 2, '10', 60),
          it('pt_Suitcase_Carry', 2, '30s', 60),
        ],
      },
    ],
  },
  {
    // One kettlebell, whole body in one session (twice or three times a week).
    id: 'kettlebell',
    days: [
      {
        key: 'kb',
        items: [
          it('pt_Kettlebell_Swing', 4, '15', 60),
          it('Goblet_Squat', 3, '10', 90),
          it('One-Arm_Kettlebell_Row', 3, '10', 75),
          it('Kettlebell_Arnold_Press', 3, '8-10', 75),
          it('pt_Kettlebell_Goblet_Reverse_Lunge', 3, '8', 75),
          it('Kettlebell_Turkish_Get-Up_Squat_style', 2, '3', 90),
        ],
      },
    ],
  },
];
