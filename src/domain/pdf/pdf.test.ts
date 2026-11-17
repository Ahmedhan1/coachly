import { describe, expect, it } from 'vitest';
import { buildContentBlocks, pdfExerciseFromCatalog, progressSummary } from './blocks';
import { layoutPdfDocument, logoBoxes, normalizeLogoSize } from './document';
import { PDF_TEST_CASES, pdfTestCase, syntheticExercises } from './fixtures';
import { ageOn, formatDate, formatNumber, resolveDisclaimer, signedLtr } from './format';
import {
  chunkText,
  CONTENT_HEIGHT_PX,
  estimateBlockHeight,
  estimateLines,
  keepsWithNext,
  paginate,
  PAGE_WIDTH_PX,
  TABLE_HEAD_PX,
} from './layout';
import { normalizeSections, PDF_PRESETS, presetTemplate } from './presets';
import type { PdfBlock, PdfDocument } from './types';

const contentBlocks = (doc: PdfDocument) => doc.pages.flatMap((p) => (p.kind === 'content' ? p.blocks : []));

describe('paginate', () => {
  const keep = (b: { k: boolean }) => b.k;
  it('fills pages greedily, never empty', () => {
    const blocks = Array.from({ length: 10 }, () => ({ k: false }));
    const pages = paginate(blocks, blocks.map(() => 300), 1000, keep);
    expect(pages.map((p) => p.length)).toEqual([3, 3, 3, 1]);
  });
  it('moves a heading (and a run of headings) to the next page with its block', () => {
    const blocks = [{ k: false }, { k: false }, { k: true }, { k: true }, { k: false }];
    const pages = paginate(blocks, [400, 400, 50, 50, 300], 1000, keep);
    expect(pages.map((p) => p.length)).toEqual([2, 3]);
  });
  it('a block taller than a page gets its own page', () => {
    const pages = paginate([{ k: false }, { k: false }, { k: false }], [100, 1500, 100], 1000, keep);
    expect(pages.map((p) => p.length)).toEqual([1, 1, 1]);
  });
});

describe('text helpers', () => {
  it('estimates wrapped lines', () => {
    expect(estimateLines('قصير', 14, 700)).toBe(1);
    expect(estimateLines('ا'.repeat(300), 14, 700)).toBe(4);
    expect(estimateLines('a\nb\nc', 14, 700)).toBe(3);
  });
  it('chunks long text at sentence ends', () => {
    const text = Array.from({ length: 30 }, (_, i) => `جملة رقم ${i} فيها كلام كتير عن التمرين.`).join(' ');
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });
  it('formats numbers and dates with Western digits', () => {
    expect(formatNumber(1820)).toBe('1,820');
    expect(formatNumber(74.5, 1)).toBe('74.5');
    expect(formatNumber(75, 1)).toBe('75');
    expect(formatNumber(1.55, 3)).toBe('1.55');
    expect(formatDate('2026-11-16')).toBe('16/11/2026');
    expect(ageOn('1995-03-04', '2026-11-16')).toBe(31);
    expect(ageOn('1995-12-04', '2026-11-16')).toBe(30);
    expect(signedLtr(-3.5, 1)).toBe('\u2066-3.5\u2069');
    expect(signedLtr(20, 0, '%')).toBe('\u2066+20%\u2069');
    expect(resolveDisclaimer('  ', 'افتراضي')).toBe('افتراضي');
    expect(resolveDisclaimer('نصي', 'افتراضي')).toBe('نصي');
  });
});

describe('layoutPdfDocument — five spec cases', () => {
  it.each(PDF_TEST_CASES)('%s: cover first, numbered pages, nothing lost, every page within A4', (id) => {
    const input = pdfTestCase(id, syntheticExercises(id === 'fifty_exercises' ? 50 : 12, id !== 'no_images'));
    const doc = layoutPdfDocument(input);
    expect(doc.pages[0]?.kind).toBe('cover');
    doc.pages.forEach((p, i) => {
      expect(p.number).toBe(i + 1);
      expect(p.total).toBe(doc.pages.length);
    });
    for (const page of doc.pages) {
      if (page.kind !== 'content') continue;
      expect(page.blocks.length).toBeGreaterThan(0);
      const used = page.blocks.reduce((n, b) => n + estimateBlockHeight(b), 0);
      expect(used).toBeLessThanOrEqual(CONTENT_HEIGHT_PX);
      expect(keepsWithNext(page.blocks[page.blocks.length - 1]!)).toBe(false); // no orphan heading
    }
    expect(doc.footer.disclaimer).toContain('لا يغني عن استشارة طبيب');
  });

  it('50-exercise program keeps all 50 exercises in order across pages', () => {
    const doc = layoutPdfDocument(pdfTestCase('fifty_exercises', syntheticExercises(50, true)));
    const ex = contentBlocks(doc).filter((b): b is Extract<PdfBlock, { type: 'exercise' }> => b.type === 'exercise');
    expect(ex.map((e) => e.index)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(ex.every((e) => e.image && e.muscleMap)).toBe(true);
    expect(doc.pages.length).toBeGreaterThanOrEqual(8);
  });

  it('no-images case carries no image references at all', () => {
    const doc = layoutPdfDocument(pdfTestCase('no_images', syntheticExercises(12, true)));
    expect(doc.theme.logo).toBeNull();
    expect(doc.theme.background).toBeNull();
    expect(JSON.stringify(doc.pages)).not.toMatch(/"kind":"(stored|pack|url)"/);
  });

  it('max branding: large logo, clamped opacity, header logo readable', () => {
    const doc = layoutPdfDocument(pdfTestCase('max_branding', syntheticExercises(12, true)));
    expect(doc.theme.logoSize).toBe('large');
    expect(doc.theme.coverLogoBox.width).toBeLessThanOrEqual(Math.round(PAGE_WIDTH_PX * 0.46));
    expect(doc.theme.headerLogoPx).toBeGreaterThanOrEqual(36);
    expect(doc.theme.background?.opacity).toBe(1);
    expect(doc.theme.coverImage).not.toBeNull();
  });

  it('only selected sections, in the trainer order; muscle maps only with muscle_map', () => {
    const base = pdfTestCase('fifty_exercises', syntheticExercises(50, true));
    const doc = layoutPdfDocument({ ...base, sections: ['supplements', 'program', 'client_info'] });
    expect(doc.pages[0]?.kind).toBe('content');
    const titles = contentBlocks(doc).filter((b) => b.type === 'sectionTitle').map((b) => (b as { text: string }).text);
    expect(titles).toEqual(['المكملات', 'جدول التمارين', 'بيانات العميل']);
    const ex = contentBlocks(doc).find((b) => b.type === 'exercise') as Extract<PdfBlock, { type: 'exercise' }>;
    expect(ex.muscleMap).toBeNull();
  });

  it('never prints a supplement dose the trainer did not enter', () => {
    const doc = layoutPdfDocument(pdfTestCase('mixed_text', syntheticExercises(12, true)));
    const sups = contentBlocks(doc).filter((b): b is Extract<PdfBlock, { type: 'supplement' }> => b.type === 'supplement');
    expect(sups[0]?.rows).toEqual([{ label: 'الجرعة', value: '5 جم' }, { label: 'الميعاد', value: 'بعد التمرين' }]);
    expect(sups[1]?.rows).toEqual([{ label: 'الميعاد', value: 'مع الغدا' }]);
  });

  it('nutrition shows calories, macros and the method', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('mixed_text', syntheticExercises(4, false)), sections: ['nutrition'] });
    const blocks = contentBlocks(doc);
    const stats = blocks.find((b) => b.type === 'stats') as Extract<PdfBlock, { type: 'stats' }>;
    expect(stats.items.map((i) => i.value)).toEqual(['1,820', '149', '171', '60']);
    const bar = blocks.find((b) => b.type === 'macroBar') as Extract<PdfBlock, { type: 'macroBar' }>;
    expect(bar.parts.reduce((n, p) => n + p.percent, 0)).toBe(100);
    expect(JSON.stringify(blocks)).toContain('Mifflin-St Jeor');
  });

  it('long names need at least as many pages as short ones', () => {
    const short = layoutPdfDocument(pdfTestCase('no_images', syntheticExercises(12, false)));
    const long = layoutPdfDocument(pdfTestCase('long_names', syntheticExercises(12, false)));
    expect(long.pages.length).toBeGreaterThanOrEqual(short.pages.length);
  });

  it('measured heights override estimates', () => {
    const input = pdfTestCase('no_images', syntheticExercises(12, false));
    const n = buildContentBlocks(input).length;
    const tall = layoutPdfDocument(input, { heights: Array.from({ length: n }, () => 400), headHeightPx: 30 });
    const own = (p: PdfDocument['pages'][number]) => (p.kind === 'content' ? p.blocks.filter((b) => b.type !== 'exerciseHead' || !b.continued).length : 0);
    expect(tall.pages.filter((p) => p.kind === 'content').every((p) => own(p) <= 2)).toBe(true);
  });
});

describe('logo sizes', () => {
  it('small < medium < large on the cover and in the header; header never under 36 px', () => {
    const [s, m, l] = (['small', 'medium', 'large'] as const).map(logoBoxes);
    expect(s!.cover.width).toBeLessThan(m!.cover.width);
    expect(m!.cover.width).toBeLessThan(l!.cover.width);
    expect(l!.cover.width).toBeGreaterThanOrEqual(Math.round(PAGE_WIDTH_PX * 0.4));
    expect(l!.cover.width).toBeLessThanOrEqual(Math.round(PAGE_WIDTH_PX * 0.46));
    for (const b of [s!, m!, l!]) expect(b.headerPx).toBeGreaterThanOrEqual(36);
  });
  it('unknown sizes fall back to large (the default)', () => {
    expect(normalizeLogoSize('huge')).toBe('large');
    expect(normalizeLogoSize(undefined)).toBe('large');
    expect(normalizeLogoSize('small')).toBe('small');
  });
});

describe('workout table', () => {
  type Ex = Extract<PdfBlock, { type: 'exercise' }>;
  type Head = Extract<PdfBlock, { type: 'exerciseHead' }>;
  it('each day opens with its title and the column header', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('fifty_exercises', syntheticExercises(50, true)), sections: ['program'] });
    const blocks = contentBlocks(doc);
    blocks.forEach((b, i) => {
      if (b.type === 'subTitle') expect(blocks[i + 1]?.type).toBe('exerciseHead');
    });
    const heads = blocks.filter((b): b is Head => b.type === 'exerciseHead');
    expect(heads[0]?.continued).toBeNull();
    expect(heads[0]?.columns.setsReps).toBe('سيتات × عدات');
  });
  it('a page never starts with a bare row: it repeats the header marked as continued', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('fifty_exercises', syntheticExercises(50, true)), sections: ['program'] });
    const pages = doc.pages.filter((p) => p.kind === 'content');
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      if (p.kind !== 'content') continue;
      expect(p.blocks[0]?.type).not.toBe('exercise');
      const first = p.blocks[0];
      if (first?.type === 'exerciseHead' && first.continued) expect(first.continued).toContain('تابع');
      const used = p.blocks.reduce((n, b) => n + estimateBlockHeight(b), 0);
      expect(used).toBeLessThanOrEqual(CONTENT_HEIGHT_PX);
    }
    const ex = contentBlocks(doc).filter((b): b is Ex => b.type === 'exercise');
    expect(ex).toHaveLength(50);
  });
  it('rows are compact: 50 exercises fit in at most 7 pages', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('fifty_exercises', syntheticExercises(50, true)), sections: ['program', 'muscle_map'] });
    expect(doc.pages.length).toBeLessThanOrEqual(7);
    expect(TABLE_HEAD_PX).toBeGreaterThan(20);
  });
  it('paginate charges the lead cost when a block starts a page', () => {
    const blocks = [{ k: false }, { k: false }, { k: false }];
    const pages = paginate(blocks, [400, 400, 400], 1000, () => false, (_b, i) => (i > 0 ? 300 : 0));
    // page 1: 400+400; page 2 starts with block 3: 300 lead + 400
    expect(pages.map((p) => p.length)).toEqual([2, 1]);
    const tight = paginate(blocks, [400, 400, 400], 1000, () => false, () => 250);
    expect(tight.map((p) => p.length)).toEqual([1, 1, 1]);
  });
});

describe('meals and progress tables', () => {
  it('meal items show grams from the recipe ingredients', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('mixed_text', syntheticExercises(4, false)), sections: ['recipes'] });
    const card = contentBlocks(doc).find((b) => b.type === 'mealCard') as Extract<PdfBlock, { type: 'mealCard' }>;
    // recipe r1: 150 g + 10 g in grams (eggs are pieces) → 160 جم
    expect(card.items[0]?.grams).toBe('160 جم');
  });
  it('progress prints a measurement table: first, latest, change', () => {
    const doc = layoutPdfDocument({ ...pdfTestCase('max_branding', syntheticExercises(4, true)), sections: ['progress'] });
    const table = contentBlocks(doc).find((b) => b.type === 'measureTable') as Extract<PdfBlock, { type: 'measureTable' }>;
    expect(table).toBeDefined();
    expect(table.head).toEqual(['القياس', 'أول قياس', 'آخر قياس', 'التغيير']);
    const weight = table.rows.find((r) => r.label === 'الوزن');
    expect(weight).toMatchObject({ first: '78', latest: '74.5', change: '\u2066-3.5\u2069', unit: 'كجم' });
  });
});

describe('presets and catalog mapping', () => {
  it('three saved templates', () => {
    expect(PDF_PRESETS.nutrition_only).not.toContain('program');
    expect(PDF_PRESETS.monthly_progress).toEqual(['cover', 'client_info', 'progress', 'notes']);
    expect(presetTemplate('full_program', 'برنامج كامل')).toMatchObject({ name: 'برنامج كامل', showLogo: true });
    expect(normalizeSections(['notes', 'cover', 'notes', 'bogus'])).toEqual(['notes', 'cover']);
  });

  it('maps a catalog exercise with its first photo and Arabic muscle names', () => {
    const e = pdfExerciseFromCatalog(
      {
        id: 'Barbell_Squat', nameEn: 'Barbell Squat', nameAr: 'باربل سكوات', primaryMuscles: ['quads'], secondaryMuscles: [],
        equipment: 'barbell', level: 'beginner', category: 'strength', force: 'push', mechanic: 'compound',
        images: [{ kind: 'pack', path: 'Barbell_Squat-0.webp' }], isCustom: false,
      },
      null,
      'exercise-pack/img/',
    );
    expect(e).toMatchObject({ name: 'باربل سكوات', secondaryName: 'Barbell Squat', image: { kind: 'pack', path: 'exercise-pack/img/Barbell_Squat-0.webp' } });
    expect(e.muscles[0]).toBe('كوادز');
  });

  it('progress summary: weights sorted, first/last photos', () => {
    const input = pdfTestCase('max_branding', syntheticExercises(4, true));
    const s = progressSummary([...input.progress].reverse());
    expect(s.weights.map((w) => w.kg)).toEqual([78, 77.2, 76.5, 75.9, 75.1, 74.5]);
    expect(s.before?.date).toBe('2026-06-01');
    expect(s.after?.date).toBe('2026-11-01');
  });
});
