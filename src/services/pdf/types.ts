import type { PdfDocumentInput } from '@/domain/pdf';
import type { Result } from '@/domain/nutrition/result';

export type PdfRenderPhase = 'fonts' | 'images' | 'layout' | 'pages' | 'finalize';

export interface PdfRenderProgress {
  phase: PdfRenderPhase;
  done: number;
  total: number;
}

export type PdfRenderError = 'cancelled' | 'render_failed' | 'no_pages';

export interface PdfRenderOptions {
  onProgress?: (p: PdfRenderProgress) => void;
  signal?: AbortSignal;
}

export interface RenderedPdf {
  blob: Blob;
  pageCount: number;
  /** Suggested file name (no path), `.pdf`. */
  fileName: string;
}

/** Builds a PDF from the domain input. Never throws. */
export interface PdfRenderer {
  render(input: PdfDocumentInput, options?: PdfRenderOptions): Promise<Result<RenderedPdf, PdfRenderError>>;
}
