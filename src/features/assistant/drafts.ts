import type { AppServices } from '@/app/services';
import { NutritionStore } from '@/data/nutritionStore';
import {
  clientFacts,
  draftSystem,
  MEAL_DRAFT_JSON_SCHEMA,
  mealDraftPrompt,
  mealDraftSchema,
  mealsFromDraft,
  parseDraft,
  PROGRAM_DRAFT_JSON_SCHEMA,
  programDraftPrompt,
  programDraftSchema,
  programFromDraft,
  safeAssistantText,
  type AiError,
} from '@/domain/ai';
import type { Client } from '@/domain/models';
import { err, ok, type Result } from '@/domain/nutrition/result';
import { loadBuiltinCatalog } from '@/app/catalog';
import { newLocalId } from '@/features/programs/ids';
import { getLocale, t } from '@/i18n';
import type { AiConfig, AiService } from '@/services/ai/aiService';

/**
 * Program / meal-day drafts (used by the client sheet and by the assistant's confirmation cards). Each runs
 * only after the trainer taps, sends client facts without name or phone, and saves a draft the trainer
 * reviews. Returns what was created so the caller can undo it.
 */

export interface DraftDeps {
  services: AppServices;
  ai: AiService;
  cfg: AiConfig;
  signal?: AbortSignal;
}

export async function draftProgram(d: DraftDeps, client: Client, days: number, notes: string, today: string): Promise<Result<{ programId: string; dropped: number }, AiError>> {
  const catalog = (await loadBuiltinCatalog()) ?? [];
  const r = await d.ai.json(d.cfg, { system: draftSystem(getLocale()), schema: PROGRAM_DRAFT_JSON_SCHEMA, prompt: programDraftPrompt({ facts: clientFacts(client, today), days, notes, catalog }) }, d.signal);
  if (!r.ok) return r;
  const draft = parseDraft(programDraftSchema, r.value);
  if (!draft) return err('bad_output');
  const { body, dropped } = programFromDraft(draft, { knownIds: new Set(catalog.map((e) => e.id)), clientId: client.id, newId: newLocalId });
  const created = await d.services.data.repos.programs.create(body);
  return ok({ programId: created.id, dropped });
}

export async function draftMealDay(d: DraftDeps, client: Client, notes: string, today: string): Promise<Result<{ mealPlanId: string }, AiError>> {
  const { repos } = d.services.data;
  const calc = await new NutritionStore(d.services.meta, repos).getCalculation(client.id);
  const recipes = await repos.recipes.list();
  const target = calc ? { kcal: calc.targetKcal, proteinG: calc.proteinG, carbG: calc.carbG, fatG: calc.fatG } : null;
  const r = await d.ai.json(d.cfg, { system: draftSystem(getLocale()), schema: MEAL_DRAFT_JSON_SCHEMA, prompt: mealDraftPrompt({ facts: clientFacts(client, today), target, notes, recipeNames: recipes.map((x) => x.name) }) }, d.signal);
  if (!r.ok) return r;
  const draft = parseDraft(mealDraftSchema, r.value);
  if (!draft) return err('bad_output');
  // Same output filter as the chat: a draft that slips in a supplement dose is refused.
  if (safeAssistantText(JSON.stringify(draft)).blocked) return err('refused');
  const existing = await repos.mealPlans.listByClient(client.id);
  const created = await repos.mealPlans.create({
    clientId: client.id,
    name: t('nutrition.plan.dayName', { n: existing.length + 1 }),
    targetKcal: calc ? Math.round(calc.targetKcal) : null,
    meals: mealsFromDraft(draft, () => crypto.randomUUID()),
    notes: draft.notes,
  });
  return ok({ mealPlanId: created.id });
}
