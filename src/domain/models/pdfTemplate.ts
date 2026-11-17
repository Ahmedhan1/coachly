import { z } from 'zod';
import { entityMetaShape, hexColorSchema, requiredNameSchema } from './common';
import { imageIdSchema, pdfTemplateIdSchema } from './ids';

export const pdfSectionSchema = z.enum([
  'cover',
  'client_info',
  'program',
  'muscle_map',
  'nutrition',
  'recipes',
  'supplements',
  'progress',
  'notes',
]);

export const pdfTemplateSchema = z
  .object({
    id: pdfTemplateIdSchema,
    name: requiredNameSchema,
    sections: z.array(pdfSectionSchema).min(1).max(20),
    coverImageId: imageIdSchema.nullable(),
    backgroundImageId: imageIdSchema.nullable(),
    showLogo: z.boolean(),
    /** null = use the trainer's primary color. */
    accentColor: hexColorSchema.nullable(),
    ...entityMetaShape,
  })
  .refine((t) => new Set(t.sections).size === t.sections.length, {
    message: 'duplicate section',
    path: ['sections'],
  });

export type PdfTemplate = z.infer<typeof pdfTemplateSchema>;
export type PdfSection = z.infer<typeof pdfSectionSchema>;
