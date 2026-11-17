import { z } from 'zod';
import type { LocalIdFactory, ProgramBody } from '../programs';
import type { ClientId, ExerciseId, Meal } from '../models';

/** What the model must return for a program draft (JSON schema sent to the API, zod validates the answer). */
export const programDraftSchema = z.object({
  name: z.string().min(1).max(80),
  days: z
    .array(
      z.object({
        name: z.string().max(80),
        items: z
          .array(
            z.object({
              exerciseId: z.string().min(1).max(120),
              sets: z.number().int().min(1).max(10),
              reps: z.string().min(1).max(20),
              restSec: z.number().int().min(0).max(600),
            }),
          )
          .max(15),
      }),
    )
    .min(1)
    .max(7),
});
export type ProgramDraft = z.infer<typeof programDraftSchema>;

export const mealDraftSchema = z.object({
  meals: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        time: z.string().max(5),
        items: z.array(z.string().min(1).max(120)).min(1).max(10),
      }),
    )
    .min(1)
    .max(8),
  notes: z.string().max(600),
});
export type MealDraft = z.infer<typeof mealDraftSchema>;

export const PROGRAM_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'days'],
  properties: {
    name: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'items'],
        properties: {
          name: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exerciseId', 'sets', 'reps', 'restSec'],
              properties: { exerciseId: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'string' }, restSec: { type: 'integer' } },
            },
          },
        },
      },
    },
  },
} as const;

export const MEAL_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meals', 'notes'],
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'time', 'items'],
        properties: { name: { type: 'string' }, time: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
      },
    },
    notes: { type: 'string' },
  },
} as const;

/** Parses a model answer; null when it is not valid JSON of the right shape. */
export function parseDraft<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Turns a draft into a program body. Exercise ids not in the catalog are dropped (the model may invent some). */
export function programFromDraft(draft: ProgramDraft, opts: { knownIds: ReadonlySet<string>; clientId: ClientId | null; newId: LocalIdFactory }): { body: ProgramBody; dropped: number } {
  let dropped = 0;
  const days = draft.days.map((d, i) => ({
    id: opts.newId(),
    name: d.name.trim() || `${i + 1}`,
    items: d.items.flatMap((it) => {
      if (!opts.knownIds.has(it.exerciseId)) {
        dropped++;
        return [];
      }
      return [{ id: opts.newId(), exerciseId: it.exerciseId as ExerciseId, sets: it.sets, reps: it.reps.trim(), restSec: it.restSec, tempo: '', rpe: null, supersetGroup: null, notes: '' }];
    }),
  }));
  return { body: { name: draft.name.trim(), clientId: opts.clientId, isTemplate: false, days, notes: '' }, dropped };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Turns a meal draft into meals with free-text items (the trainer swaps in recipes afterwards). */
export function mealsFromDraft(draft: MealDraft, newId: () => string): Meal[] {
  return draft.meals.map((m) => ({
    id: newId() as Meal['id'],
    name: m.name.trim(),
    time: TIME.test(m.time) ? m.time : null,
    items: m.items.map((text) => ({ recipeId: null, text: text.trim().slice(0, 120), servings: 1 })),
  }));
}
