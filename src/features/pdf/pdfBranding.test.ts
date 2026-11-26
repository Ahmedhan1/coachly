import { describe, expect, it } from 'vitest';
import { memoryMetaStore } from '@/data/metaStore';
import { DEFAULT_PDF_BRANDING, PDF_BRANDING_KEY, readPdfBranding, savePdfBranding } from './pdfBranding';

describe('PDF branding font', () => {
  it('reads a font that is no longer bundled as Rubik and keeps the rest of the trainer’s look', async () => {
    const meta = memoryMetaStore({
      [PDF_BRANDING_KEY]: { ...DEFAULT_PDF_BRANDING, fontFamily: 'Readex Pro', footerText: 'كابتن كريم', logoPlacement: 'center' },
    });
    const read = await readPdfBranding(meta);
    expect(read.fontFamily).toBe('Rubik');
    expect(read.footerText).toBe('كابتن كريم');
    expect(read.logoPlacement).toBe('center');
  });

  it('keeps Cairo when the trainer picked it', async () => {
    const meta = memoryMetaStore();
    await savePdfBranding(meta, { ...DEFAULT_PDF_BRANDING, fontFamily: 'Cairo' });
    expect((await readPdfBranding(meta)).fontFamily).toBe('Cairo');
  });
});
