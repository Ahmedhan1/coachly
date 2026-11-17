import { ageInYears } from '../meals';
import type { Client } from '../models';

/** Prompts for the program / meal-day drafts (used by the client draft sheet and the assistant). */

export const DRAFT_SYSTEM = `You help an Egyptian personal trainer draft plans. The trainer reviews every draft before using it.
Write all names in Egyptian Arabic. Gym and muscle terms are transliterated, never translated (Glutes = جلوتس, Bench Press = بنش برس, Deadlift = ديدليفت).
Never suggest supplements or medication doses. Respect injuries by avoiding exercises that load them.
Reply with ONE JSON object only, matching the JSON schema given in the request. No text outside the JSON.`;

/** Draft system prompt for the trainer's app language (passed in by the UI layer; Arabic by default). */
export function draftSystem(language: 'ar' | 'en' = 'ar'): string {
  if (language === 'ar') return DRAFT_SYSTEM;
  return DRAFT_SYSTEM.replace(
    /^Write all names in Egyptian Arabic\..*$/m,
    'Write all names in plain English with standard gym names (Glutes, Bench Press, Deadlift).',
  );
}

/** Client facts without name or phone (privacy): goal, sex, age, injuries, measurements. */
export function clientFacts(c: Client, today: string): string {
  const m = c.measurements;
  const age = ageInYears(c.birthDate, today);
  return [
    `goal: ${c.goal}${c.goalNote ? ` (${c.goalNote})` : ''}`,
    c.gender ? `sex: ${c.gender}` : null,
    age ? `age: ${age}` : null,
    m.weightKg ? `weight: ${m.weightKg} kg` : null,
    m.heightCm ? `height: ${m.heightCm} cm` : null,
    m.bodyFatPercent ? `body fat: ${m.bodyFatPercent}%` : null,
    `injuries: ${c.injuries.length ? c.injuries.join('; ') : 'none'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function programDraftPrompt(input: { facts: string; days: number; notes: string; catalog: ReadonlyArray<{ id: string; nameEn: string; primaryMuscles: readonly string[]; equipment: string }> }): string {
  const list = input.catalog.map((e) => `${e.id}|${e.nameEn}|${e.primaryMuscles.join(',')}|${e.equipment}`).join('\n');
  return `Draft a ${input.days}-day weekly training program.\nClient:\n${input.facts}\nTrainer notes: ${input.notes || '-'}\n\nUse ONLY exerciseId values from this list (id|name|muscles|equipment):\n${list}`;
}

export function mealDraftPrompt(input: { facts: string; target: { kcal: number; proteinG: number; carbG: number; fatG: number } | null; notes: string; recipeNames: readonly string[] }): string {
  const t = input.target;
  const target = t ? `target: ${Math.round(t.kcal)} kcal, protein ${Math.round(t.proteinG)} g, carbs ${Math.round(t.carbG)} g, fat ${Math.round(t.fatG)} g` : 'no calorie target saved';
  return `Draft one day of Egyptian meals (time as HH:MM, items with rough grams).\nClient:\n${input.facts}\n${target}\nTrainer notes: ${input.notes || '-'}\nTrainer's recipes you may use by name: ${input.recipeNames.join('، ') || '-'}`;
}

/** Puts the JSON schema into the request text (Groq JSON mode needs the shape spelled out). */
export function withSchema(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}\n\nReturn JSON matching this JSON schema:\n${JSON.stringify(schema)}`;
}
