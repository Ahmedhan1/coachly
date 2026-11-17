import { buildContentBlocks } from './blocks';
import { formatDate } from './format';
import { contrastRatio, deriveBrand, mixHex, normalizeHex, type Surfaces } from '../branding';
import {
  CONTENT_HEIGHT_PX,
  COVER_LOGO_MAX,
  COVER_LOGO_MIN,
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

/** Cover logo box for a size setting: scales linearly from COVER_LOGO_MIN to COVER_LOGO_MAX. */
export function coverLogoBox(px: number): { width: number; height: number } {
  const t = (clampLogoPx(px) - MIN_LOGO_PX) / (MAX_LOGO_PX - MIN_LOGO_PX);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return { width: lerp(COVER_LOGO_MIN.width, COVER_LOGO_MAX.width), height: lerp(COVER_LOGO_MIN.height, COVER_LOGO_MAX.height) };
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
  const cover = clampLogoPx(b.logoHeightPx);
  return {
    ...pdfColors(b.primaryColor),
    secondaryColor: b.secondaryColor,
    fontFamily: b.fontFamily,
    trainerName: b.trainerName,
    logo: b.logo,
    logoPlacement: b.logoPlacement,
    coverLogoPx: cover,
    coverLogoBox: coverLogoBox(cover),
    headerLogoPx: HEADER_LOGO_MAX_PX,
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
