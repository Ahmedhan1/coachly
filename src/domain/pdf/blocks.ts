import { exerciseAltName, exerciseName, muscleLabel, type ExerciseLocale } from '../exercises/display';
import type { CatalogExercise } from '../exercises/types';
import type { Measurements, PdfSection, ProgressEntry, Recipe } from '../models';
import { chunkText } from './layout';
import { ageOn, formatDate, formatNumber, signedLtr } from './format';
import type { KeyValue, PdfBlock, PdfDocumentInput, PdfExercise, PdfImageRef, StatItem } from './types';

/**
 * Builds the PDF view of a catalog exercise. `packBase` prefixes pack image paths (e.g. 'exercise-pack/img/').
 * `locale` picks the main name and muscle labels; the other language's name is the small second line.
 */
export function pdfExerciseFromCatalog(
  e: CatalogExercise,
  muscleMap: PdfImageRef | null = null,
  packBase = '',
  locale: ExerciseLocale = 'ar',
): PdfExercise {
  const first = e.images[0];
  const image: PdfImageRef | null = !first
    ? null
    : first.kind === 'pack'
      ? { kind: 'pack', path: `${packBase}${first.path}` }
      : { kind: 'stored', imageId: first.imageId };
  return {
    name: exerciseName(e, locale),
    secondaryName: locale === 'ar' ? (e.nameEn && e.nameEn !== e.nameAr ? e.nameEn : null) : exerciseAltName(e, locale),
    muscles: e.primaryMuscles.map((m) => muscleLabel(m, locale)),
    image,
    muscleMap,
  };
}

const MEASUREMENT_KEYS: readonly (keyof Measurements)[] = [
  'weightKg',
  'heightCm',
  'bodyFatPercent',
  'waistCm',
  'hipCm',
  'chestCm',
  'armCm',
  'thighCm',
];

/** List separator for the document language. */
const listSep = (input: PdfDocumentInput): string => (input.language === 'en' ? ', ' : '، ');

function measurementUnit(key: keyof Measurements, input: PdfDocumentInput): string {
  const u = input.labels.units;
  return key === 'weightKg' ? u.kg : key === 'bodyFatPercent' ? u.percent : u.cm;
}

function paragraphs(text: string, muted = false): PdfBlock[] {
  return chunkText(text).map((t) => ({ type: 'paragraph', text: t, muted }));
}

/** Key/value grids are split into chunks so one grid never has to cross a page. */
function keyValueBlocks(rows: KeyValue[], perBlock = 8): PdfBlock[] {
  const out: PdfBlock[] = [];
  for (let i = 0; i < rows.length; i += perBlock) out.push({ type: 'keyValues', rows: rows.slice(i, i + perBlock) });
  return out;
}

function clientBlocks(input: PdfDocumentInput): PdfBlock[] {
  const c = input.client;
  if (!c) return [];
  const L = input.labels.client;
  const chips: string[] = [`${L.goal}: ${L.goals[c.goal]}`];
  if (c.gender) chips.push(L.genders[c.gender]);
  const age = ageOn(c.birthDate, input.generatedOn);
  if (age !== null) chips.push(`${age} ${input.labels.units.years}`);
  const tiles: StatItem[] = [];
  for (const key of MEASUREMENT_KEYS) {
    const v = c.measurements[key];
    if (v === undefined) continue;
    tiles.push({ label: L.measurements[key], value: formatNumber(v, 1), unit: measurementUnit(key, input), emphasis: key === 'weightKg' });
  }
  const out: PdfBlock[] = [{ type: 'clientCard', name: c.name, chips, tiles }];
  if (c.goalNote) out.push(...paragraphs(`${L.goalNote}: ${c.goalNote}`));
  if (c.injuries.length > 0) out.push(...paragraphs(`${L.injuries}: ${c.injuries.join(listSep(input))}`));
  return out;
}

/** Whole percentages that always add up to 100 (largest remainder). */
export function wholePercents(values: readonly number[]): number[] {
  const total = values.reduce((n, v) => n + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  const missing = 100 - out.reduce((n, v) => n + v, 0);
  for (let k = 0; k < missing; k++) out[order[k % order.length]![1]]! += 1;
  return out;
}

function nutritionBlocks(input: PdfDocumentInput): PdfBlock[] {
  const n = input.nutrition;
  if (!n) return [];
  const L = input.labels.nutrition;
  const u = input.labels.units;
  const m = n.macros;
  const [pp, pc, pf] = wholePercents([m.proteinKcal, m.carbKcal, m.fatKcal]);
  return [
    {
      type: 'stats',
      items: [
        { label: L.target, value: formatNumber(n.targetKcal), unit: u.kcal, emphasis: true },
        { label: L.protein, value: formatNumber(m.proteinG), unit: u.g },
        { label: L.carbs, value: formatNumber(m.carbG), unit: u.g },
        { label: L.fat, value: formatNumber(m.fatG), unit: u.g },
      ],
    },
    {
      type: 'macroBar',
      parts: [
        { label: L.protein, percent: pp ?? 0, tone: 'protein' },
        { label: L.carbs, percent: pc ?? 0, tone: 'carbs' },
        { label: L.fat, percent: pf ?? 0, tone: 'fat' },
      ],
    },
    ...keyValueBlocks([
      { label: L.method, value: L.methods[n.method] },
      { label: L.bmr, value: `${formatNumber(n.bmrKcal)} ${u.kcal}` },
      { label: L.activityFactor, value: `× ${formatNumber(n.activityFactor, 3)}` },
      { label: L.tdee, value: `${formatNumber(n.tdeeKcal)} ${u.kcal}` },
      { label: L.adjustment, value: signedLtr(n.adjustmentPercent, 1, u.percent) },
      ...(n.waterMl !== null ? [{ label: L.water, value: `${formatNumber(n.waterMl)} ${u.ml}` }] : []),
    ]),
  ];
}

/** The column header of the exercise table (`continued` set on a page that carries a day on). */
export function exerciseHead(input: PdfDocumentInput, withMap: boolean, continued: string | null): PdfBlock {
  const L = input.labels.program;
  return { type: 'exerciseHead', columns: { exercise: L.exercise, setsReps: L.setsReps, rest: L.rest, details: L.details }, withMap, continued };
}

function programBlocks(input: PdfDocumentInput, withMuscleMaps: boolean): PdfBlock[] {
  const p = input.program;
  if (!p) return [];
  const L = input.labels.program;
  const out: PdfBlock[] = [];
  let index = 0;
  for (const day of p.days) {
    if (day.items.length === 0) continue;
    out.push({ type: 'subTitle', text: day.name, meta: `${L.exerciseCount}: ${day.items.length}` });
    out.push(exerciseHead(input, withMuscleMaps, null));
    day.items.forEach((item, k) => {
      index += 1;
      const ex = input.exercises.get(item.exerciseId);
      const extras: KeyValue[] = [];
      if (item.tempo) extras.push({ label: L.tempo, value: item.tempo });
      if (item.rpe !== null) extras.push({ label: L.rpe, value: formatNumber(item.rpe, 1) });
      out.push({
        type: 'exercise',
        index,
        name: ex?.name ?? item.exerciseId,
        secondaryName: ex?.secondaryName ?? null,
        muscles: ex ? ex.muscles.join(listSep(input)) : '',
        sets: String(item.sets),
        reps: item.reps,
        rest: `${item.restSec} ${input.labels.units.sec}`,
        extras,
        notes: item.notes,
        image: ex?.image ?? null,
        muscleMap: withMuscleMaps ? (ex?.muscleMap ?? null) : null,
        superset: item.supersetGroup ? `${L.superset} ${item.supersetGroup}` : null,
        withMap: withMuscleMaps,
        last: k === day.items.length - 1,
      });
    });
  }
  return out;
}

/** Day title of the exercise row at `i` (for the "continued" header), or ''. */
export function dayTitleBefore(blocks: readonly PdfBlock[], i: number): string {
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]!;
    if (b.type === 'subTitle') return b.text;
    if (b.type === 'sectionTitle') return '';
  }
  return '';
}

const GRAM_UNITS = new Set(['جم', 'جرام', 'g', 'gm', 'gr', 'gram', 'grams', 'مل', 'ml']);

/** Grams (and ml, counted 1:1) of one serving of a recipe; null when no ingredient is weighed. */
export function recipeGramsPerServing(r: Recipe): number | null {
  const weighed = r.ingredients.filter((i) => GRAM_UNITS.has(i.unit.trim().toLowerCase()));
  if (weighed.length === 0) return null;
  return weighed.reduce((n, i) => n + i.quantity, 0) / r.servings;
}

function recipeTotals(r: Recipe): MacroSum | null {
  if (r.ingredients.length === 0 || r.ingredients.some((i) => i.kcal === null)) return null;
  const sum = (k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => r.ingredients.reduce((n, i) => n + (i[k] ?? 0), 0) / r.servings;
  return { kcal: sum('kcal'), p: sum('proteinG'), c: sum('carbsG'), f: sum('fatG') };
}

interface MacroSum {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

const addMacros = (a: MacroSum, b: MacroSum, times = 1): MacroSum => ({
  kcal: a.kcal + b.kcal * times,
  p: a.p + b.p * times,
  c: a.c + b.c * times,
  f: a.f + b.f * times,
});

function macroItems(m: MacroSum, input: PdfDocumentInput, kcalLabel: string): StatItem[] {
  const u = input.labels.units;
  const N = input.labels.nutrition;
  return [
    { label: kcalLabel, value: formatNumber(m.kcal), unit: u.kcal, emphasis: true },
    { label: N.protein, value: formatNumber(m.p), unit: u.g },
    { label: N.carbs, value: formatNumber(m.c), unit: u.g },
    { label: N.fat, value: formatNumber(m.f), unit: u.g },
  ];
}

/**
 * Meal plan as cards (items + macros per meal), a daily total and water, the plan notes, then the cookbook
 * pages of the recipes used. Macros come only from recipes with full ingredient data; free-text items are
 * listed without numbers and the totals say they are partial.
 */
function mealBlocks(input: PdfDocumentInput): PdfBlock[] {
  const plan = input.mealPlan;
  if (!plan) return [];
  const L = input.labels.meals;
  const u = input.labels.units;
  const recipes = new Map(input.recipes.map((r) => [r.id as string, r]));
  const used: Recipe[] = [];
  const out: PdfBlock[] = [];
  const zero: MacroSum = { kcal: 0, p: 0, c: 0, f: 0 };
  let day = zero;
  let dayKnown = false;
  let partial = false;
  for (const meal of plan.meals) {
    if (meal.items.length === 0) continue;
    let sum = zero;
    let known = false;
    const items = meal.items.map((item) => {
      const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined;
      if (recipe && !used.includes(recipe)) used.push(recipe);
      const name = recipe?.name ?? item.text;
      const extra = recipe && item.text ? ` — ${item.text}` : '';
      const t = recipe ? recipeTotals(recipe) : null;
      if (t) {
        sum = addMacros(sum, t, item.servings);
        known = true;
      } else partial = true;
      const grams = recipe ? recipeGramsPerServing(recipe) : null;
      return {
        text: `${name}${extra}`,
        detail: `${formatNumber(item.servings, 2)} ${L.servings}`,
        grams: grams !== null ? `${formatNumber(grams * item.servings)} ${u.g}` : '',
        kcal: t ? `${formatNumber(t.kcal * item.servings)} ${u.kcal}` : '',
      };
    });
    if (known) {
      day = addMacros(day, sum);
      dayKnown = true;
    }
    out.push({ type: 'mealCard', name: meal.name, time: meal.time ?? '', items, totals: known ? macroItems(sum, input, L.mealTotal) : null });
  }
  const water = input.nutrition?.waterMl ?? null;
  if (dayKnown || water !== null) {
    const items = dayKnown ? macroItems(day, input, L.dailyTotal) : [];
    if (water !== null) items.push({ label: L.water, value: formatNumber(water), unit: u.ml });
    out.push({ type: 'stats', items });
    if (dayKnown && partial) out.push({ type: 'paragraph', text: L.partialTotals, muted: true });
  }
  if (plan.notes) out.push(...paragraphs(plan.notes, true));
  if (used.length > 0) out.push({ type: 'subTitle', text: L.recipesTitle, meta: '' });
  for (const r of used) {
    const t = recipeTotals(r);
    const detail = t
      ? `${L.perServing}: ${formatNumber(t.kcal)} ${u.kcal} · ${input.labels.nutrition.protein} ${formatNumber(t.p)}${u.g} · ${input.labels.nutrition.carbs} ${formatNumber(t.c)}${u.g} · ${input.labels.nutrition.fat} ${formatNumber(t.f)}${u.g}`
      : '';
    out.push({
      type: 'recipe',
      name: r.name,
      detail,
      ingredients: r.ingredients.map((i) => `${formatNumber(i.quantity, 1)} ${i.unit} ${i.name}`),
      instructions: chunkText(r.instructions, 600)[0] ?? '',
      image: input.recipeImages?.get(r.id) ?? (r.imageId ? { kind: 'stored', imageId: r.imageId } : null),
    });
  }
  return out;
}

function supplementBlocks(input: PdfDocumentInput): PdfBlock[] {
  const L = input.labels.supplements;
  return input.supplements.map((s) => {
    // Dose and timing are printed only as the trainer typed them; the app never fills them in.
    const rows: KeyValue[] = [];
    if (s.dose.trim()) rows.push({ label: L.dose, value: s.dose.trim() });
    if (s.timing.trim()) rows.push({ label: L.timing, value: s.timing.trim() });
    return {
      type: 'supplement',
      name: s.name,
      rows,
      notes: chunkText(s.notes, 300)[0] ?? '',
      image: input.supplementImages?.get(s.id) ?? (s.imageId ? { kind: 'stored', imageId: s.imageId } : null),
    };
  });
}

export function progressSummary(entries: readonly ProgressEntry[]) {
  const sorted = [...entries].filter((e) => e.deletedAt === null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const weights = sorted.filter((e) => e.measurements.weightKg !== undefined).map((e) => ({ date: e.date, kg: e.measurements.weightKg! }));
  const withPhotos = sorted.filter((e) => e.photoIds.length > 0);
  const first = sorted[0] ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  return {
    weights,
    before: withPhotos[0] ?? null,
    after: withPhotos.length > 1 ? withPhotos[withPhotos.length - 1]! : null,
    first,
    last: last !== first ? last : null,
  };
}

function progressBlocks(input: PdfDocumentInput): PdfBlock[] {
  const L = input.labels.progress;
  const s = progressSummary(input.progress);
  const out: PdfBlock[] = [];
  if (s.weights.length >= 2) out.push({ type: 'weightChart', title: L.weightChart, points: s.weights, unit: input.labels.units.kg });
  if (s.first && s.last) {
    const rows: Extract<PdfBlock, { type: 'measureTable' }>['rows'] = [];
    const a = s.first.measurements;
    const b = s.last.measurements;
    for (const key of MEASUREMENT_KEYS) {
      const va = a[key];
      const vb = b[key];
      if (va === undefined || vb === undefined) continue;
      rows.push({
        label: input.labels.client.measurements[key],
        first: formatNumber(va, 1),
        latest: formatNumber(vb, 1),
        change: signedLtr(vb - va, 1),
        unit: measurementUnit(key, input),
      });
    }
    if (rows.length > 0) {
      out.push({ type: 'subTitle', text: `${L.first} ${formatDate(s.first.date)} · ${L.latest} ${formatDate(s.last.date)}`, meta: '' });
      for (let i = 0; i < rows.length; i += 8) {
        out.push({ type: 'measureTable', head: [L.measurement, L.first, L.latest, L.change], rows: rows.slice(i, i + 8) });
      }
    }
  }
  if (s.before && s.after) {
    out.push({
      type: 'photoPair',
      before: { image: { kind: 'stored', imageId: s.before.photoIds[0]! }, caption: `${L.before} · ${formatDate(s.before.date)}` },
      after: { image: { kind: 'stored', imageId: s.after.photoIds[0]! }, caption: `${L.after} · ${formatDate(s.after.date)}` },
    });
  }
  return out;
}

function notesBlocks(input: PdfDocumentInput): PdfBlock[] {
  const out: PdfBlock[] = [];
  if (input.notes.trim()) out.push(...paragraphs(input.notes));
  if (input.program?.notes.trim()) out.push(...paragraphs(input.program.notes, true));
  const lines = input.branding.contactLines.filter((l) => l.trim());
  if (lines.length > 0 || input.branding.logo || input.branding.trainerName) {
    out.push({ type: 'contact', title: input.labels.notes.contact, lines: [...lines], closing: input.labels.notes.closing });
  }
  return out;
}

/** Content blocks for the selected sections, in the trainer's order. Empty sections are skipped. */
export function buildContentBlocks(input: PdfDocumentInput): PdfBlock[] {
  const withMaps = input.sections.includes('muscle_map');
  const builders: Partial<Record<PdfSection, () => PdfBlock[]>> = {
    client_info: () => clientBlocks(input),
    nutrition: () => nutritionBlocks(input),
    program: () => programBlocks(input, withMaps),
    recipes: () => mealBlocks(input),
    supplements: () => supplementBlocks(input),
    progress: () => progressBlocks(input),
    notes: () => notesBlocks(input),
  };
  const out: PdfBlock[] = [];
  let index = 0;
  for (const section of input.sections) {
    const body = builders[section]?.() ?? [];
    if (body.length === 0) continue;
    out.push({ type: 'sectionTitle', text: input.labels.sections[section], index: ++index }, ...body);
  }
  return out;
}
