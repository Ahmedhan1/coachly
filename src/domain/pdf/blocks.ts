import { muscleGroupLabelAr } from '../exercises/labels';
import type { CatalogExercise } from '../exercises/types';
import type { Measurements, PdfSection, ProgressEntry, Recipe } from '../models';
import { chunkText } from './layout';
import { ageOn, formatDate, formatNumber, signedLtr } from './format';
import type { KeyValue, PdfBlock, PdfDocumentInput, PdfExercise, PdfImageRef } from './types';

/** Builds the PDF view of a catalog exercise. `packBase` prefixes pack image paths (e.g. 'exercise-pack/img/'). */
export function pdfExerciseFromCatalog(e: CatalogExercise, muscleMap: PdfImageRef | null = null, packBase = ''): PdfExercise {
  const first = e.images[0];
  const image: PdfImageRef | null = !first
    ? null
    : first.kind === 'pack'
      ? { kind: 'pack', path: `${packBase}${first.path}` }
      : { kind: 'stored', imageId: first.imageId };
  const secondary = e.nameEn && e.nameEn !== e.nameAr ? e.nameEn : null;
  return { name: e.nameAr, secondaryName: secondary, muscles: e.primaryMuscles.map(muscleGroupLabelAr), image, muscleMap };
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

function measurementUnit(key: keyof Measurements, input: PdfDocumentInput): string {
  const u = input.labels.units;
  return key === 'weightKg' ? u.kg : key === 'bodyFatPercent' ? u.percent : u.cm;
}

function measurementRows(m: Measurements, input: PdfDocumentInput): KeyValue[] {
  const rows: KeyValue[] = [];
  for (const key of MEASUREMENT_KEYS) {
    const v = m[key];
    if (v !== undefined) rows.push({ label: input.labels.client.measurements[key], value: `${formatNumber(v, 1)} ${measurementUnit(key, input)}` });
  }
  return rows;
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
  const rows: KeyValue[] = [{ label: L.name, value: c.name }];
  if (c.gender) rows.push({ label: L.gender, value: L.genders[c.gender] });
  const age = ageOn(c.birthDate, input.generatedOn);
  if (age !== null) rows.push({ label: L.age, value: `${age} ${input.labels.units.years}` });
  rows.push({ label: L.goal, value: L.goals[c.goal] });
  if (c.goalNote) rows.push({ label: L.goalNote, value: c.goalNote });
  rows.push(...measurementRows(c.measurements, input));
  const out = keyValueBlocks(rows);
  if (c.injuries.length > 0) out.push(...paragraphs(`${L.injuries}: ${c.injuries.join('، ')}`));
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

function programBlocks(input: PdfDocumentInput, withMuscleMaps: boolean): PdfBlock[] {
  const p = input.program;
  if (!p) return [];
  const L = input.labels.program;
  const out: PdfBlock[] = [];
  let index = 0;
  for (const day of p.days) {
    if (day.items.length === 0) continue;
    out.push({ type: 'subTitle', text: day.name, meta: '' });
    for (const item of day.items) {
      index += 1;
      const ex = input.exercises.get(item.exerciseId);
      const prescription: KeyValue[] = [
        { label: L.sets, value: String(item.sets) },
        { label: L.reps, value: item.reps },
        { label: L.rest, value: `${item.restSec} ${input.labels.units.sec}` },
      ];
      if (item.tempo) prescription.push({ label: L.tempo, value: item.tempo });
      if (item.rpe !== null) prescription.push({ label: L.rpe, value: formatNumber(item.rpe, 1) });
      out.push({
        type: 'exercise',
        index,
        name: ex?.name ?? item.exerciseId,
        secondaryName: ex?.secondaryName ?? null,
        muscles: ex ? ex.muscles.join('، ') : '',
        prescription,
        notes: item.notes,
        image: ex?.image ?? null,
        muscleMap: withMuscleMaps ? (ex?.muscleMap ?? null) : null,
        superset: item.supersetGroup ? `${L.superset} ${item.supersetGroup}` : null,
      });
    }
  }
  return out;
}

function recipeTotals(r: Recipe): { kcal: number; p: number; c: number; f: number } | null {
  if (r.ingredients.some((i) => i.kcal === null)) return null;
  const sum = (k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => r.ingredients.reduce((n, i) => n + (i[k] ?? 0), 0) / r.servings;
  return { kcal: sum('kcal'), p: sum('proteinG'), c: sum('carbsG'), f: sum('fatG') };
}

function mealBlocks(input: PdfDocumentInput): PdfBlock[] {
  const plan = input.mealPlan;
  if (!plan) return [];
  const L = input.labels.meals;
  const u = input.labels.units;
  const recipes = new Map(input.recipes.map((r) => [r.id as string, r]));
  const used: Recipe[] = [];
  const out: PdfBlock[] = [];
  for (const meal of plan.meals) {
    out.push({ type: 'subTitle', text: meal.name, meta: meal.time ?? '' });
    for (const item of meal.items) {
      const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined;
      if (recipe && !used.includes(recipe)) used.push(recipe);
      const name = recipe?.name ?? item.text;
      const extra = recipe && item.text ? ` — ${item.text}` : '';
      out.push({ type: 'mealItem', text: `${name}${extra}`, detail: `${formatNumber(item.servings, 2)} ${L.servings}` });
    }
  }
  if (plan.notes) out.push(...paragraphs(plan.notes, true));
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
    const rows: KeyValue[] = [];
    const a = s.first.measurements;
    const b = s.last.measurements;
    for (const key of MEASUREMENT_KEYS) {
      const va = a[key];
      const vb = b[key];
      if (va === undefined || vb === undefined) continue;
      const d = vb - va;
      const unit = measurementUnit(key, input);
      rows.push({
        label: input.labels.client.measurements[key],
        value: `${formatNumber(va, 1)} ← ${formatNumber(vb, 1)} ${unit} (${signedLtr(d, 1)})`,
      });
    }
    if (rows.length > 0) {
      out.push({ type: 'subTitle', text: `${L.first} ${formatDate(s.first.date)} · ${L.latest} ${formatDate(s.last.date)}`, meta: '' });
      out.push(...keyValueBlocks(rows));
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
  if (lines.length > 0) out.push({ type: 'contact', title: input.labels.notes.contact, lines: [...lines] });
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
  for (const section of input.sections) {
    const body = builders[section]?.() ?? [];
    if (body.length === 0) continue;
    out.push({ type: 'sectionTitle', text: input.labels.sections[section] }, ...body);
  }
  return out;
}
