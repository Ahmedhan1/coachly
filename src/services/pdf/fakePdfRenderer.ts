import { layoutPdfDocument, type PdfDocumentInput } from '@/domain/pdf';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { PdfRenderer, PdfRenderError, PdfRenderOptions, RenderedPdf } from './types';

/** For UI tests: lays the document out (pure) and returns a tiny fake PDF; no DOM. */
export class FakePdfRenderer implements PdfRenderer {
  readonly inputs: PdfDocumentInput[] = [];
  failWith: PdfRenderError | null = null;

  async render(input: PdfDocumentInput, options: PdfRenderOptions = {}): Promise<Result<RenderedPdf, PdfRenderError>> {
    this.inputs.push(input);
    if (options.signal?.aborted) return err('cancelled');
    if (this.failWith) return err(this.failWith);
    const pages = layoutPdfDocument(input).pages.length;
    if (pages > 0) options.onProgress?.({ phase: 'pages', done: pages, total: pages });
    return ok({ blob: new Blob(['%PDF-1.3 fake'], { type: 'application/pdf' }), pageCount: pages, fileName: 'fake.pdf' });
  }
}
