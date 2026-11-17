import { buildContentBlocks, dayTitleBefore, exerciseHead } from './blocks';
import { formatDate } from './format';
import { contrastRatio, deriveBrand, mixHex, normalizeHex, type Surfaces } from '../branding';
import { CONTENT_HEIGHT_PX, estimateBlockHeight, keepsWithNext, LOGO_BOXES, paginate } from './layout';
import type { PdfBlock, PdfCover, PdfDocument, PdfDocumentInput, PdfFooter, PdfLogoSize, PdfPage, PdfTheme } from './types';

/** Any stored value → a valid logo size; 'large' is the default. */
export function normalizeLogoSize(value: unknown): PdfLogoSize {
  return value === 'small' || value === 'medium' || value === 'large' ? value : 'large';
}

/** Cover box and header height for a logo size setting. */
export function logoBoxes(size: PdfLogoSize): { cover: { width: number; height: number }; headerPx: number } {
  const b = LOGO_BOXES[normalizeLogoSize(size)];
  return { cover: { ...b.cover }, headerPx: b.headerPx };
}

const FALLBACK_PRIMARY = '#2F6F5E';
/** The PDF is printed on white paper. */
const PAPER: Surfaces = {
  light: { bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F6F6F4' },
  dark: { bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F6F6F4' },
};

/** A darker shade of the brand that always carries white text (≥ 4.5:1): cover strip, section numbers. */
function deepShade(brand: string): string {
  for (let k = 0.28; k < 1; k += 0.04) {
    const c = mixHex(brand, '#000000', k);
    if (contrastRatio(c, '#FFFFFF') >= 4.5) return c;
  }
  return '#000000';
}

/** Text-safe variants of the trainer's color for white paper (same rules as the app, DESIGN.md §2). */
export function pdfColors(primary: string): Pick<PdfTheme, 'primaryColor' | 'onPrimary' | 'primaryInk' | 'primaryTint' | 'primaryDeep'> {
  const hex = normalizeHex(primary) ?? FALLBACK_PRIMARY;
  const t = deriveBrand(hex, PAPER).light;
  return {
    primaryColor: t.brand,
    onPrimary: t.brandOn,
    primaryInk: t.brandInk,
    primaryTint: mixHex('#FFFFFF', hex, 0.09),
    primaryDeep: deepShade(t.brand),
  };
}

export function pdfTheme(input: PdfDocumentInput): PdfTheme {
  const b = input.branding;
  const size = normalizeLogoSize(b.logoSize);
  const boxes = logoBoxes(size);
  return {
    ...pdfColors(b.primaryColor),
    secondaryColor: b.secondaryColor,
    fontFamily: b.fontFamily,
    trainerName: b.trainerName,
    logo: b.logo,
    logoPlacement: b.logoPlacement,
    logoSize: size,
    coverLogoBox: boxes.cover,
    headerLogoPx: boxes.headerPx,
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
    planForLabel: L.planFor,
    contactLabel: L.contact,
    contacts: input.branding.contactLines.map((l) => l.trim()).filter(Boolean),
  };
}

export interface LayoutOptions {
  /** Measured outer heights per content block (same order as `buildContentBlocks`); estimates otherwise. */
  heights?: readonly number[];
  contentHeightPx?: number;
  /** Measured outer height of a repeated ("continued") table header. */
  headHeightPx?: number;
}

/**
 * The whole document as ordered page descriptors: optional cover, then content pages with the selected
 * sections split across A4 pages. Pure; the renderer turns each page into pixels.
 */
export function layoutPdfDocument(input: PdfDocumentInput, options: LayoutOptions = {}): PdfDocument {
  const blocks: PdfBlock[] = buildContentBlocks(input);
  const heights = options.heights ?? blocks.map(estimateBlockHeight);
  // A table row that opens a page gets the column header again, marked "day · continued".
  const continuedHead = (i: number): PdfBlock | null => {
    const b = blocks[i];
    if (b?.type !== 'exercise') return null;
    const day = dayTitleBefore(blocks, i);
    return exerciseHead(input, b.withMap, [day, input.labels.program.continued].filter(Boolean).join(' · '));
  };
  const groups = paginate(blocks, heights, options.contentHeightPx ?? CONTENT_HEIGHT_PX, keepsWithNext, (_b, i) => {
    const head = continuedHead(i);
    return head ? (options.headHeightPx ?? estimateBlockHeight(head)) : 0;
  });
  groups.forEach((g) => {
    const first = g[0];
    if (first?.type !== 'exercise') return;
    const head = continuedHead(blocks.indexOf(first));
    if (head) g.unshift(head);
  });
  const hasCover = input.sections.includes('cover');
  const total = groups.length + (hasCover ? 1 : 0);
  const pages: PdfPage[] = [];
  if (hasCover) pages.push({ kind: 'cover', number: 1, total, cover: coverOf(input) });
  groups.forEach((g) => pages.push({ kind: 'content', number: pages.length + 1, total, blocks: g }));
  return { theme: pdfTheme(input), footer: pdfFooter(input), pages };
}
