import { z } from 'zod';
import type { MetaStore } from '@/data/metaStore';

/** PDF look the trainer controls (logo placement/size, font, backgrounds, footer, contacts, disclaimer). */
export const PDF_BRANDING_KEY = 'pdf.branding';

export const PDF_FONTS = ['Rubik', 'Cairo'] as const;

export const pdfBrandingSchema = z.object({
  logoPlacement: z.enum(['start', 'center', 'end']),
  /** Older saves had a pixel slider (logoHeightPx, now dropped); they read as the default 'large'. */
  logoSize: z.enum(['small', 'medium', 'large']).catch('large'),
  /** Fonts that are no longer bundled (Readex Pro, Alexandria before 2026-11-26) read as Rubik; the rest of the look is kept. */
  fontFamily: z.enum(PDF_FONTS).catch('Rubik'),
  backgroundImageId: z.string().min(1).nullable(),
  backgroundOpacity: z.number().min(0).max(1),
  coverImageId: z.string().min(1).nullable(),
  footerText: z.string().max(200),
  contactLines: z.array(z.string().max(120)).max(6),
  /** null = the default line from ar.ts. */
  disclaimer: z.string().max(300).nullable(),
});

export type PdfBrandingSettings = z.infer<typeof pdfBrandingSchema>;

export const DEFAULT_PDF_BRANDING: PdfBrandingSettings = {
  logoPlacement: 'start',
  logoSize: 'large',
  fontFamily: 'Rubik',
  backgroundImageId: null,
  backgroundOpacity: 0.12,
  coverImageId: null,
  footerText: '',
  contactLines: [],
  disclaimer: null,
};

export async function readPdfBranding(meta: MetaStore): Promise<PdfBrandingSettings> {
  const parsed = pdfBrandingSchema.safeParse(await meta.get(PDF_BRANDING_KEY));
  return parsed.success ? parsed.data : DEFAULT_PDF_BRANDING;
}

export async function savePdfBranding(meta: MetaStore, value: PdfBrandingSettings): Promise<void> {
  await meta.set(PDF_BRANDING_KEY, pdfBrandingSchema.parse(value));
}
