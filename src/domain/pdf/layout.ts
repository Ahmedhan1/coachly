import type { PdfBlock } from './types';

/** A4 at 96 CSS px per inch: 210 × 297 mm → 794 × 1123 px. */
export const PAGE_WIDTH_PX = 794;
export const PAGE_HEIGHT_PX = 1123;
export const PAGE_MARGIN_X_PX = 44;
export const PAGE_MARGIN_TOP_PX = 32;
export const PAGE_MARGIN_BOTTOM_PX = 20;
export const HEADER_HEIGHT_PX = 64;
export const FOOTER_HEIGHT_PX = 74;
export const BLOCK_GAP_PX = 12;
export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * PAGE_MARGIN_X_PX;
export const CONTENT_HEIGHT_PX =
  PAGE_HEIGHT_PX - PAGE_MARGIN_TOP_PX - HEADER_HEIGHT_PX - FOOTER_HEIGHT_PX - PAGE_MARGIN_BOTTOM_PX;

export const MIN_LOGO_PX = 24;
export const MAX_LOGO_PX = 160;
export const HEADER_LOGO_MAX_PX = 44;

/** Image box sizes the renderer uses (kept here so estimates match). */
export const EXERCISE_IMAGE_PX = 112;
export const RECIPE_IMAGE_PX = 120;
export const SUPPLEMENT_IMAGE_PX = 72;
export const CHART_HEIGHT_PX = 240;
export const PHOTO_PAIR_HEIGHT_PX = 340;

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
      h = textHeight(block.text, FONT.title, W) + 14;
      break;
    case 'subTitle':
      h = textHeight(`${block.text}  ${block.meta}`, FONT.sub, W) + 10;
      break;
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
      h = Math.ceil(block.items.length / 4) * 96;
      break;
    case 'macroBar':
      h = 64;
      break;
    case 'paragraph':
      h = textHeight(block.text, FONT.body, W) + 4;
      break;
    case 'exercise': {
      const images = (block.image ? 1 : 0) + (block.muscleMap ? 1 : 0);
      const textW = W - images * (EXERCISE_IMAGE_PX + 12) - 48;
      const text =
        textHeight(block.name, FONT.name, textW) +
        (block.secondaryName ? textHeight(block.secondaryName, FONT.small, textW) : 0) +
        (block.muscles ? textHeight(block.muscles, FONT.small, textW) : 0) +
        textHeight(block.prescription.map((p) => `${p.label} ${p.value}`).join('   '), FONT.body, textW) +
        (block.notes ? textHeight(block.notes, FONT.small, textW) : 0) +
        8;
      h = Math.max(images > 0 ? EXERCISE_IMAGE_PX : 0, text) + 24;
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
      h = Math.max(block.image ? SUPPLEMENT_IMAGE_PX : 0, text) + 24;
      break;
    }
    case 'weightChart':
      h = CHART_HEIGHT_PX + 36;
      break;
    case 'photoPair':
      h = PHOTO_PAIR_HEIGHT_PX + 32;
      break;
    case 'contact':
      h = textHeight(block.title, FONT.sub, W) + block.lines.reduce((n, l) => n + textHeight(l, FONT.body, W - 32), 0) + 28;
      break;
  }
  return h + BLOCK_GAP_PX;
}

/** Headings stay on the same page as the block after them. */
export function keepsWithNext(block: PdfBlock): boolean {
  return block.type === 'sectionTitle' || block.type === 'subTitle';
}

/**
 * Greedy pagination. `heights[i]` is the outer height of `blocks[i]` (estimated here, or measured in the
 * real DOM by the renderer). Rules: a block is never split; a heading never ends a page (it moves with
 * the block after it); no empty pages; a block taller than a page gets a page of its own.
 */
export function paginate<T>(blocks: readonly T[], heights: readonly number[], pageHeight: number, keep: (b: T) => boolean): T[][] {
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
    if (current.length > 0 && used + need > pageHeight && need <= pageHeight) {
      pages.push(current);
      current = [];
      used = 0;
    } else if (current.length > 0 && used + heightAt(i) > pageHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
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
