import { buildContentBlocks } from './blocks';
import { formatDate } from './format';
import {
  CONTENT_HEIGHT_PX,
  estimateBlockHeight,
  HEADER_LOGO_MAX_PX,
  keepsWithNext,
  MAX_LOGO_PX,
  MIN_LOGO_PX,
  paginate,
} from './layout';
import type { PdfBlock, PdfCover, PdfDocument, PdfDocumentInput, PdfFooter, PdfPage, PdfTheme } from './types';

export function clampLogoPx(px: number): number {
  if (!Number.isFinite(px)) return MIN_LOGO_PX;
  return Math.min(MAX_LOGO_PX, Math.max(MIN_LOGO_PX, Math.round(px)));
}

export function pdfTheme(input: PdfDocumentInput): PdfTheme {
  const b = input.branding;
  const cover = clampLogoPx(b.logoHeightPx);
  return {
    primaryColor: b.primaryColor,
    secondaryColor: b.secondaryColor,
    fontFamily: b.fontFamily,
    trainerName: b.trainerName,
    logo: b.logo,
    logoPlacement: b.logoPlacement,
    coverLogoPx: cover,
    headerLogoPx: Math.min(cover, HEADER_LOGO_MAX_PX),
    background: b.background ? { image: b.background.image, opacity: Math.min(1, Math.max(0, b.background.opacity)) } : null,
    coverImage: b.coverImage,
  };
}

export function pdfFooter(input: PdfDocumentInput): PdfFooter {
  return {
    disclaimer: input.disclaimer.trim(),
    text: input.branding.footerText.trim(),
    contact: input.branding.contactLines.filter((l) => l.trim()).join('  ·  '),
  };
}

function coverOf(input: PdfDocumentInput): PdfCover {
  const L = input.labels.cover;
  return {
    title: input.title,
    subtitle: input.subtitle,
    clientLabel: L.client,
    clientName: input.client?.name ?? '',
    preparedByLabel: L.preparedBy,
    trainerName: input.branding.trainerName,
    dateLabel: L.date,
    dateText: formatDate(input.generatedOn),
  };
}

export interface LayoutOptions {
  /** Measured outer heights per content block (same order as `buildContentBlocks`); estimates otherwise. */
  heights?: readonly number[];
  contentHeightPx?: number;
}

/**
 * The whole document as ordered page descriptors: optional cover, then content pages with the selected
 * sections split across A4 pages. Pure; the renderer turns each page into pixels.
 */
export function layoutPdfDocument(input: PdfDocumentInput, options: LayoutOptions = {}): PdfDocument {
  const blocks: PdfBlock[] = buildContentBlocks(input);
  const heights = options.heights ?? blocks.map(estimateBlockHeight);
  const groups = paginate(blocks, heights, options.contentHeightPx ?? CONTENT_HEIGHT_PX, keepsWithNext);
  const hasCover = input.sections.includes('cover');
  const total = groups.length + (hasCover ? 1 : 0);
  const pages: PdfPage[] = [];
  if (hasCover) pages.push({ kind: 'cover', number: 1, total, cover: coverOf(input) });
  groups.forEach((g) => pages.push({ kind: 'content', number: pages.length + 1, total, blocks: g }));
  return { theme: pdfTheme(input), footer: pdfFooter(input), pages };
}
