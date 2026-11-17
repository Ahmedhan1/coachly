import type { PdfBlock } from './types';

/** A4 at 96 CSS px per inch: 210 × 297 mm → 794 × 1123 px. */
export const PAGE_WIDTH_PX = 794;
export const PAGE_HEIGHT_PX = 1123;
export const PAGE_MARGIN_X_PX = 40;
/** Includes the 8 px brand strip across the top edge. */
export const PAGE_MARGIN_TOP_PX = 26;
export const PAGE_MARGIN_BOTTOM_PX = 18;
export const HEADER_HEIGHT_PX = 78;
export const FOOTER_HEIGHT_PX = 64;
export const BLOCK_GAP_PX = 10;
export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * PAGE_MARGIN_X_PX;
export const CONTENT_HEIGHT_PX =
  PAGE_HEIGHT_PX - PAGE_MARGIN_TOP_PX - HEADER_HEIGHT_PX - FOOTER_HEIGHT_PX - PAGE_MARGIN_BOTTOM_PX;

/**
 * Logo boxes per size setting (object-fit: contain, aspect kept). Cover: large ≈ 45 % of the page width.
 * Header: never under 36 CSS px (≈ 9.5 mm printed), so the logo stays readable on every page.
 */
export const LOGO_BOXES = {
  small: { cover: { width: 250, height: 170 }, headerPx: 38 },
  medium: { cover: { width: 310, height: 210 }, headerPx: 46 },
  large: { cover: { width: 360, height: 250 }, headerPx: 54 },
} as const;

/** Image box sizes the renderer uses (kept here so estimates match). */
export const EXERCISE_IMAGE_PX = 60;
export const MUSCLE_MAP_PX = 52;
/** Exercise table columns (CSS px); the name column takes the rest. */
export const TABLE_COLS = { index: 30, image: 72, setsReps: 96, rest: 64, details: 128, map: 64 } as const;
export const TABLE_HEAD_PX = 34;
/** Vertical padding inside a row (top + bottom). */
export const ROW_PAD_PX = 16;
export const RECIPE_IMAGE_PX = 132;
export const SUPPLEMENT_IMAGE_PX = 80;
export const CHART_HEIGHT_PX = 230;
export const PHOTO_PAIR_HEIGHT_PX = 340;
export const CLOSING_LOGO_PX = 120;

export const FONT = { body: 14, small: 12, sub: 17, title: 21, name: 16 } as const;
const LINE = 1.6;
/** Conservative average glyph width (Arabic + Latin mix) as a fraction of the font size. */
const GLYPH = 0.56;

/** Lines `text` needs at `fontPx` in a box `widthPx` wide; hard line breaks count. */
export function estimateLines(text: string, fontPx: number, widthPx: number): number {
  const perLine = Math.max(8, Math.floor(widthPx / (fontPx * GLYPH)));
  return text
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil([...line].length / perLine)), 0);
}

const textHeight = (text: string, fontPx: number, widthPx: number) =>
  Math.ceil(estimateLines(text, fontPx, widthPx) * fontPx * LINE);

/** Estimated outer height (including the gap after it) of one block, in CSS px. */
export function estimateBlockHeight(block: PdfBlock): number {
  const W = CONTENT_WIDTH_PX;
  let h: number;
  switch (block.type) {
    case 'sectionTitle':
      h = textHeight(block.text, FONT.title, W - 90) + 22;
      break;
    case 'subTitle':
      h = textHeight(`${block.text}  ${block.meta}`, FONT.sub, W - 40) + 16;
      break;
    case 'clientCard': {
      const tiles = Math.ceil(block.tiles.length / 4) * 78;
      h = textHeight(block.name, 24, W - 32) + (block.chips.length > 0 ? 40 : 0) + tiles + 40;
      break;
    }
    case 'keyValues': {
      const half = W / 2 - 16;
      let rows = 0;
      for (let i = 0; i < block.rows.length; i += 2) {
        const pair = block.rows.slice(i, i + 2);
        rows += Math.max(...pair.map((r) => textHeight(`${r.label}: ${r.value}`, FONT.body, half))) + 12;
      }
      h = rows + 8;
      break;
    }
    case 'stats':
      h = Math.ceil(block.items.length / 5) * 92;
      break;
    case 'macroBar':
      h = 72;
      break;
    case 'paragraph':
      h = textHeight(block.text, FONT.body, W) + 4;
      break;
    case 'exerciseHead':
      // Flush with the first row under it (no gap).
      return TABLE_HEAD_PX + (block.continued ? 26 : 0);
    case 'exercise': {
      const C = TABLE_COLS;
      const textW = W - C.index - C.image - C.setsReps - C.rest - C.details - (block.withMap ? C.map : 0) - 16;
      const text =
        textHeight(block.name, FONT.name - 1, textW) +
        (block.secondaryName ? textHeight(block.secondaryName, FONT.small - 1, textW) : 0) +
        (block.muscles ? 22 : 0);
      const details =
        block.extras.length * 19 + (block.notes ? textHeight(block.notes, FONT.small - 1, C.details - 12) : 0) + (block.superset ? 22 : 0);
      h = Math.max(EXERCISE_IMAGE_PX, block.muscleMap ? MUSCLE_MAP_PX : 0, text, details, 40) + ROW_PAD_PX + 1;
      return h + (block.last ? BLOCK_GAP_PX : 0);
    }
    case 'measureTable':
      h = TABLE_HEAD_PX + block.rows.length * 36 + 2;
      break;
    case 'mealCard': {
      const rows = block.items.reduce((n, i) => n + textHeight(i.text, FONT.body, W - 300) + 12, 0);
      h = 52 + rows + (block.totals ? 48 : 0) + 8;
      break;
    }
    case 'mealItem':
      h = textHeight(`${block.text} ${block.detail}`, FONT.body, W - 24) + 10;
      break;
    case 'recipe': {
      const textW = W - (block.image ? RECIPE_IMAGE_PX + 16 : 0) - 32;
      const top =
        textHeight(block.name, FONT.name, textW) +
        textHeight(block.detail, FONT.small, textW) +
        block.ingredients.reduce((n, i) => n + textHeight(`• ${i}`, FONT.small, textW), 0) +
        8;
      h = Math.max(block.image ? RECIPE_IMAGE_PX : 0, top) + (block.instructions ? textHeight(block.instructions, FONT.small, W - 32) + 8 : 0) + 24;
      break;
    }
    case 'supplement': {
      const textW = W - (block.image ? SUPPLEMENT_IMAGE_PX + 16 : 0) - 32;
      const text =
        textHeight(block.name, FONT.name, textW) +
        block.rows.reduce((n, r) => n + textHeight(`${r.label}: ${r.value}`, FONT.body, textW), 0) +
        (block.notes ? textHeight(block.notes, FONT.small, textW) : 0);
      h = Math.max(block.image ? SUPPLEMENT_IMAGE_PX : 0, text) + 28;
      break;
    }
    case 'weightChart':
      h = CHART_HEIGHT_PX + 52;
      break;
    case 'photoPair':
      h = PHOTO_PAIR_HEIGHT_PX + 32;
      break;
    case 'contact':
      h =
        CLOSING_LOGO_PX +
        textHeight(block.closing, 20, W - 64) +
        textHeight(block.title, FONT.sub, W) +
        Math.ceil(block.lines.length / 2) * 44 +
        96;
      break;
  }
  return h + BLOCK_GAP_PX;
}

/** Headings (and a table's column header) stay on the same page as the block after them. */
export function keepsWithNext(block: PdfBlock): boolean {
  return block.type === 'sectionTitle' || block.type === 'subTitle' || block.type === 'exerciseHead';
}

/** Space after a block: table rows sit flush; the last row of a day and every other block get the gap. */
export function blockGap(block: PdfBlock): number {
  return (block.type === 'exercise' && !block.last) || block.type === 'exerciseHead' ? 0 : BLOCK_GAP_PX;
}

/**
 * Greedy pagination. `heights[i]` is the outer height of `blocks[i]` (estimated here, or measured in the
 * real DOM by the renderer). Rules: a block is never split; a heading never ends a page (it moves with
 * the block after it); no empty pages; a block taller than a page gets a page of its own. `lead(b, i)` is
 * extra height charged when block i opens a page (e.g. a repeated table header printed above it).
 */
export function paginate<T>(
  blocks: readonly T[],
  heights: readonly number[],
  pageHeight: number,
  keep: (b: T) => boolean,
  lead: (b: T, i: number) => number = () => 0,
): T[][] {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  const heightAt = (i: number) => heights[i] ?? 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    let need = heightAt(i);
    // A run of headings (section title + day title) travels with the first real block after it.
    if (keep(block)) {
      let j = i + 1;
      while (j < blocks.length && keep(blocks[j]!)) need += heightAt(j++);
      if (j < blocks.length) need += heightAt(j);
    }
    const breakNow =
      current.length > 0 && ((used + need > pageHeight && need + lead(block, i) <= pageHeight) || used + heightAt(i) > pageHeight);
    if (breakNow) {
      pages.push(current);
      current = [];
      used = 0;
    }
    if (current.length === 0) used = lead(block, i);
    current.push(block);
    used += heightAt(i);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Splits long text into chunks of at most `maxChars` (at line breaks, then sentence ends, then spaces) so
 * every paragraph block fits on a page and long notes flow across pages.
 */
export function chunkText(text: string, maxChars = 420): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    let rest = para.trim();
    while ([...rest].length > maxChars) {
      const head = rest.slice(0, maxChars);
      const cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf('. '), head.lastIndexOf('، '), head.lastIndexOf('؛ '));
      const at = cut > maxChars / 2 ? cut + 1 : head.lastIndexOf(' ') > maxChars / 2 ? head.lastIndexOf(' ') : maxChars;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
