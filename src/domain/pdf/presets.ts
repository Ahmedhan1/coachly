import type { PdfSection, PdfTemplate } from '../models';

export type PdfPresetId = 'full_program' | 'nutrition_only' | 'monthly_progress';

/**
 * Built-in saved templates (spec: "برنامج كامل"، "تغذية فقط"، "تقرير تقدم شهري"). Names are i18n strings
 * the UI passes in; the trainer can copy and edit them like any template.
 */
export const PDF_PRESETS: Readonly<Record<PdfPresetId, readonly PdfSection[]>> = {
  full_program: ['cover', 'client_info', 'nutrition', 'program', 'muscle_map', 'recipes', 'supplements', 'progress', 'notes'],
  nutrition_only: ['cover', 'client_info', 'nutrition', 'recipes', 'supplements', 'notes'],
  monthly_progress: ['cover', 'client_info', 'progress', 'notes'],
};

export const PDF_PRESET_IDS = Object.keys(PDF_PRESETS) as PdfPresetId[];

export type NewPdfTemplateFields = Pick<PdfTemplate, 'name' | 'sections' | 'coverImageId' | 'backgroundImageId' | 'showLogo' | 'accentColor'>;

/** Fields for creating a template from a preset (pass to the pdfTemplates repository). */
export function presetTemplate(id: PdfPresetId, name: string): NewPdfTemplateFields {
  return { name, sections: [...PDF_PRESETS[id]], coverImageId: null, backgroundImageId: null, showLogo: true, accentColor: null };
}

/** Keeps the trainer's order, removes duplicates and unknown ids. */
export function normalizeSections(sections: readonly string[], known: readonly PdfSection[] = PDF_PRESETS.full_program): PdfSection[] {
  const out: PdfSection[] = [];
  for (const s of sections) if ((known as readonly string[]).includes(s) && !out.includes(s as PdfSection)) out.push(s as PdfSection);
  return out;
}
