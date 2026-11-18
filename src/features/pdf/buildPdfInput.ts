import type { SavedCalculation } from '@/domain/meals';
import type { CatalogExercise } from '@/domain/exercises';
import type { Client, MealPlan, PdfSection, Program, ProgressEntry, Recipe, Supplement, TrainerSettings } from '@/domain/models';
import { pdfExerciseFromCatalog, resolveDisclaimer, type PdfDocumentInput, type PdfExercise, type PdfImageRef, type PdfNutrition } from '@/domain/pdf';
import { getLocale } from '@/i18n';
import { ar } from '@/i18n/ar';
import { pdf as enPdf } from '@/i18n/en/pdf';
import type { PdfBrandingSettings } from './pdfBranding';

export interface PdfSources {
  sections: readonly PdfSection[];
  title: string;
  subtitle: string;
  notes: string;
  today: string;
  settings: TrainerSettings;
  branding: PdfBrandingSettings;
  client: Client | null;
  program: Program | null;
  catalog: ReadonlyMap<string, CatalogExercise>;
  calculation: SavedCalculation | null;
  mealPlan: MealPlan | null;
  recipes: readonly Recipe[];
  supplements: readonly Supplement[];
  progress: readonly ProgressEntry[];
  /**
   * Muscle picture per exercise id: every exercise when the muscle_map section is on, and always the ones
   * without a photo (the picture then takes the photo's place in the exercise row).
   */
  muscleMaps?: ReadonlyMap<string, PdfImageRef>;
}

const stored = (id: string | null | undefined): PdfImageRef | null => (id ? { kind: 'stored', imageId: id } : null);

/** Saved calculator result → the PDF's calories-and-macros section. */
export function pdfNutritionFrom(c: SavedCalculation): PdfNutrition {
  return {
    method: c.input.formula === 'katch-mcardle' ? 'katch_mcardle' : 'mifflin_st_jeor',
    bmrKcal: c.bmr,
    activityFactor: c.bmr > 0 ? Math.round((c.tdee / c.bmr) * 1000) / 1000 : 0,
    tdeeKcal: c.tdee,
    targetKcal: c.targetKcal,
    adjustmentPercent: c.tdee > 0 ? Math.round((c.targetKcal / c.tdee - 1) * 100) : 0,
    macros: {
      proteinG: c.proteinG,
      fatG: c.fatG,
      carbG: c.carbG,
      proteinKcal: c.proteinKcal,
      fatKcal: c.fatKcal,
      carbKcal: c.carbKcal,
      carbsClamped: c.carbG <= 0,
      excessKcal: 0,
    },
    waterMl: c.waterMaxMl > 0 ? Math.round((c.waterMinMl + c.waterMaxMl) / 2) : null,
  };
}

/** Everything from the app's stores and settings, in the shape the PDF domain lays out. */
export function buildPdfInput(src: PdfSources): PdfDocumentInput {
  const exercises = new Map<string, PdfExercise>();
  for (const day of src.program?.days ?? []) {
    for (const item of day.items) {
      const e = src.catalog.get(item.exerciseId);
      if (e && !exercises.has(item.exerciseId)) exercises.set(item.exerciseId, pdfExerciseFromCatalog(e, src.muscleMaps?.get(item.exerciseId) ?? null, '', getLocale()));
    }
  }
  const usedRecipeIds = new Set((src.mealPlan?.meals ?? []).flatMap((m) => m.items.flatMap((i) => (i.recipeId ? [i.recipeId] : []))));
  const recipes = src.recipes.filter((r) => usedRecipeIds.has(r.id));
  const b = src.branding;
  return {
    sections: src.sections,
    labels: getLocale() === 'en' ? enPdf.doc : ar.pdf.doc,
    language: getLocale(),
    branding: {
      trainerName: src.settings.name,
      logo: stored(src.settings.logoImageId),
      logoPlacement: b.logoPlacement,
      logoSize: b.logoSize,
      primaryColor: src.settings.primaryColor,
      secondaryColor: src.settings.secondaryColor,
      fontFamily: b.fontFamily,
      background: b.backgroundImageId ? { image: { kind: 'stored', imageId: b.backgroundImageId }, opacity: b.backgroundOpacity } : null,
      coverImage: stored(b.coverImageId),
      footerText: b.footerText,
      contactLines: b.contactLines,
    },
    disclaimer: resolveDisclaimer(b.disclaimer, getLocale() === 'en' ? enPdf.disclaimerDefault : ar.pdf.disclaimerDefault),
    generatedOn: src.today,
    title: src.title,
    subtitle: src.subtitle,
    client: src.client,
    program: src.program,
    exercises,
    nutrition: src.calculation ? pdfNutritionFrom(src.calculation) : null,
    mealPlan: src.mealPlan,
    recipes,
    recipeImages: new Map(recipes.flatMap((r) => (r.imageId ? [[r.id, { kind: 'stored', imageId: r.imageId } as PdfImageRef]] : []))),
    supplements: src.supplements,
    supplementImages: new Map(src.supplements.flatMap((s) => (s.imageId ? [[s.id, { kind: 'stored', imageId: s.imageId } as PdfImageRef]] : []))),
    progress: src.progress,
    notes: src.notes,
  };
}
