import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  BLOCK_GAP_PX,
  buildContentBlocks,
  layoutPdfDocument,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  type PdfDocumentInput,
} from '@/domain/pdf';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { ImageDownscaler } from '@/services/storage/types';
import { safeFileName } from '@/services/share/shareService';
import { DEFAULT_FONT_BASE_URL, loadPdfFonts } from './fonts';
import { collectImageRefs, PdfCanvasDownscaler, ResolvedImages, type PdfImageSource } from './images';
import { blockHtml, fontStack, pageHtml } from './pageHtml';
import { pdfStyles } from './pageStyles';
import type { PdfRenderer, PdfRenderError, PdfRenderOptions, RenderedPdf } from './types';

export interface HtmlPdfRendererOptions {
  images: PdfImageSource;
  downscaler?: ImageDownscaler;
  /** Where readex-pro-*.woff2 / alexandria-*.woff2 live. Default '/fonts/'. */
  fontBaseUrl?: string;
  /** Canvas pixels per CSS px. 1.75 → 1390 × 1965 px per page ≈ 168 dpi. */
  pixelRatio?: number;
  jpegQuality?: number;
  /** Longest side for embedded pictures before rendering (spec: ~1200 px). */
  maxImageSide?: number;
  /**
   * Extra snapshot passes before the kept one. WebKit sometimes paints <img> inside the SVG snapshot only on
   * the second pass; set to 1 on Safari if images come out blank (MANUAL_QA).
   */
  warmupPasses?: number;
  /** Width in px of the small JPEG preview kept per page (0 = none). Default 360. */
  previewWidth?: number;
  /** Keep page nodes visible for debugging/screenshots instead of removing them. */
  keepPages?: boolean;
  /** Called with each page node right before it is snapshotted (harness screenshots). */
  onPageNode?: (node: HTMLElement, index: number) => Promise<void> | void;
}

const STYLE_ID = 'ptpdf-styles';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = pdfStyles();
  document.head.appendChild(style);
}

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Off-screen but laid out (html-to-image reads computed styles). Not display:none.
  host.style.cssText = `position:fixed;top:0;left:-${PAGE_WIDTH_PX + 200}px;width:${PAGE_WIDTH_PX}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);
  return host;
}

async function imagesReady(node: HTMLElement): Promise<void> {
  await Promise.all(
    [...node.querySelectorAll('img')].map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined))),
  );
}

/** A small copy of a page for the in-app preview (an <iframe> PDF shows nothing on Android Chrome). */
async function previewOf(canvas: HTMLCanvasElement, width: number): Promise<Blob | null> {
  try {
    const small = document.createElement('canvas');
    small.width = width;
    small.height = Math.round((canvas.height / canvas.width) * width);
    const ctx = small.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
    const blob = await new Promise<Blob | null>((resolve) => small.toBlob(resolve, 'image/jpeg', 0.7));
    small.width = 0;
    small.height = 0;
    return blob;
  } catch {
    return null;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('jpeg encode failed'))),
      'image/jpeg',
      quality,
    ),
  );
}

/**
 * html-to-image + jsPDF pipeline: fonts → downscaled images → measure blocks in the real DOM → paginate
 * (domain) → for each page: build an off-screen A4 node, snapshot to a canvas, JPEG, add to the PDF,
 * release the canvas and node before the next page. Never throws.
 */
export class HtmlPdfRenderer implements PdfRenderer {
  constructor(private readonly o: HtmlPdfRendererOptions) {}

  async render(input: PdfDocumentInput, options: PdfRenderOptions = {}): Promise<Result<RenderedPdf, PdfRenderError>> {
    let host: HTMLElement | null = null;
    let images: ResolvedImages | null = null;
    try {
      const progress = options.onProgress;
      const cancelled = () => options.signal?.aborted === true;
      ensureStyles();

      progress?.({ phase: 'fonts', done: 0, total: 1 });
      const families = [...new Set([input.branding.fontFamily, 'Readex Pro'])];
      const fonts = await loadPdfFonts(families, this.o.fontBaseUrl ?? DEFAULT_FONT_BASE_URL);
      progress?.({ phase: 'fonts', done: 1, total: 1 });
      if (cancelled()) return err('cancelled');

      const blocks = buildContentBlocks(input);
      const refs = collectImageRefs([blocks, input.branding.logo, input.branding.background, input.branding.coverImage]);
      images = await ResolvedImages.resolve(refs, this.o.images, this.o.downscaler ?? new PdfCanvasDownscaler(), {
        maxSide: this.o.maxImageSide,
        signal: options.signal,
        onEach: (done, total) => progress?.({ phase: 'images', done, total }),
      });
      if (cancelled()) return err('cancelled');
      const urlOf = images.url.bind(images);

      host = makeHost();
      progress?.({ phase: 'layout', done: 0, total: 1 });
      const measure = document.createElement('div');
      measure.className = 'ptpdf-measure';
      measure.dir = 'rtl';
      measure.lang = 'ar';
      measure.style.fontFamily = fontStack(input.branding.fontFamily);
      measure.innerHTML = blocks.map((b) => blockHtml(b, urlOf, input.branding.primaryColor)).join('');
      host.appendChild(measure);
      await imagesReady(measure);
      // Each block carries margin-block-end = BLOCK_GAP_PX; measure the border box and add the gap.
      const heights = [...measure.children].map((el) => Math.ceil((el as HTMLElement).getBoundingClientRect().height) + BLOCK_GAP_PX);
      measure.remove();
      const doc = layoutPdfDocument(input, { heights });
      progress?.({ phase: 'layout', done: 1, total: 1 });
      if (doc.pages.length === 0) return err('no_pages');

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const ratio = this.o.pixelRatio ?? 1.75;
      const quality = this.o.jpegQuality ?? 0.8;
      const previewWidth = this.o.previewWidth ?? 360;
      const previews: Blob[] = [];
      for (let i = 0; i < doc.pages.length; i++) {
        if (cancelled()) return err('cancelled');
        const page = doc.pages[i]!;
        const wrap = document.createElement('div');
        wrap.innerHTML = pageHtml(doc, page, urlOf, input.title);
        const node = wrap.firstElementChild as HTMLElement;
        host.appendChild(node);
        await imagesReady(node);
        await this.o.onPageNode?.(node, i);
        const snap = {
          width: PAGE_WIDTH_PX,
          height: PAGE_HEIGHT_PX,
          pixelRatio: ratio,
          backgroundColor: '#ffffff',
          fontEmbedCSS: fonts.embedCss,
          skipAutoScale: true,
          cacheBust: false,
        };
        for (let w = 0; w < (this.o.warmupPasses ?? 0); w++) {
          const c = await toCanvas(node, snap);
          c.width = 0;
          c.height = 0;
        }
        const canvas = await toCanvas(node, snap);
        const jpeg = await canvasToJpeg(canvas, quality);
        if (previewWidth > 0) {
          const preview = await previewOf(canvas, previewWidth);
          if (preview) previews.push(preview);
        }
        // Free the bitmap now: iOS caps total canvas memory, and 50-exercise PDFs have many pages.
        canvas.width = 0;
        canvas.height = 0;
        if (!this.o.keepPages) node.remove();
        if (i > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(jpeg, 'JPEG', 0, 0, 210, 297, `p${i}`, 'NONE');
        progress?.({ phase: 'pages', done: i + 1, total: doc.pages.length });
      }
      progress?.({ phase: 'finalize', done: 0, total: 1 });
      const blob = pdf.output('blob');
      progress?.({ phase: 'finalize', done: 1, total: 1 });
      const base = [input.title, input.client?.name].filter(Boolean).join(' - ');
      return ok({ blob, pageCount: doc.pages.length, fileName: `${safeFileName(base, 'program')}.pdf`, previews });
    } catch {
      return err('render_failed');
    } finally {
      images?.release();
      if (host && !this.o.keepPages) host.remove();
    }
  }
}
