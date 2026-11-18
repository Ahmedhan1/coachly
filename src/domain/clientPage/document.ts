import type { Client, MealPlan, Program } from '../models';
import { mergeItemNotes } from '../programs/tailor';

/** Mirror of worker/src/share/document.ts (ShareDocumentV1 / CheckinDocumentV1). Keep the two in sync. */
export type ShareDocumentV1 = {
  v: 1;
  updatedAt: number;
  brand: { name: string; color: string; logo?: string };
  client: { firstName: string };
  programTitle?: string;
  days: Array<{
    title: string;
    exercises: Array<{ name: string; sets?: number; reps?: string; restSec?: number; tempo?: string; rpe?: number; image?: string; notes?: string }>;
  }>;
  /** `options`: other ways to eat the meal on the same numbers; the client picks one on his page (optional). */
  meals: Array<{ title: string; time?: string; items: string[]; notes?: string; options?: Array<{ items: string[] }> }>;
  supplements: Array<{ name: string; text: string }>;
  notes: string;
  checkinsEnabled: boolean;
} & ShareExtras;

export type ShareSeriesKey = 'weight' | 'waist' | 'bodyFat' | 'hip' | 'chest' | 'arm' | 'thigh';

/** Optional parts of version 1 (older viewers ignore them). Mirror of the Worker's optional fields. */
export interface ShareExtras {
  goal?: { title: string; note?: string };
  targets?: { kcal?: number; proteinG?: number; carbG?: number; fatG?: number; waterMinMl?: number; waterMaxMl?: number };
  mealDays?: Array<{ title: string; kcal?: number; meals: ShareDocumentV1['meals'] }>;
  progress?: Array<{ key: ShareSeriesKey; points: Array<{ d: string; v: number }> }>;
  records?: Array<{ name: string; weightKg: number; reps: number; d: string }>;
  sessions?: Array<{ at: number; durationMin: number }>;
  package?: { left: number; total: number; endDate?: string };
  attended?: number;
  nextDay?: number;
  /** Weeks in a row with an attended session. */
  streakWeeks?: number;
  /** The client's own check-ins (newest first). */
  checkins?: Array<{ d: string; weightKg?: number; waistCm?: number }>;
  /** Date of the first measurement (YYYY-MM-DD). */
  startDate?: string;
  /** Language the trainer's app is in; the viewer shows its labels (and direction) in it. Absent = Arabic. */
  lang?: 'ar' | 'en';
}

export interface CheckinDocumentV1 {
  v: 1;
  kind: 'checkin';
  createdAt: number;
  weightKg?: number;
  waistCm?: number;
  notes?: string;
  photo?: string;
  photos?: string[];
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  sleepHours?: number;
  /** 1 (very tired) … 5 (great). */
  energy?: number;
  /** How much of the plan the client followed this week, 0–100 %. */
  adherence?: number;
}

const cut = (s: string, n: number) => s.trim().slice(0, n);
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const IMAGE_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

export interface ShareSources {
  now: number;
  trainerName: string;
  color: string;
  /** Small logo as a data URL (≤ 100 000 chars), or null. */
  logo?: string | null;
  client: Pick<Client, 'name'>;
  program: Program | null;
  /** Arabic name and (for built-in pack exercises) the photo file name inside /exercise-pack/img/. */
  /** `note`: the client's own note on the exercise (added to the item's notes). */
  exercise: (id: string) => { name: string; imageFile: string | null; note?: string };
  dayTitle: (index: number, name: string) => string;
  mealPlan: MealPlan | null;
  /** Text for a meal item (recipe name or the free text) with its servings. */
  mealItem: (item: MealPlan['meals'][number]['items'][number]) => string;
  supplements: ReadonlyArray<{ name: string; dose: string; timing: string; notes: string }>;
  notes: string;
  checkinsEnabled: boolean;
  /** Progress dashboard, sessions, targets… (see `shareExtras`). Cut to the Worker's limits here. */
  extras?: ShareExtras;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: number | undefined, min: number, max: number) => (v !== undefined && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

/** Drops anything outside the Worker guard's ranges so one odd value never blanks the whole page. */
/** Caps a meal's optional choices (≤ 3, ≤ 30 lines of ≤ 200 chars); drops empty ones. */
function cleanMeal(m: ShareDocumentV1['meals'][number]): ShareDocumentV1['meals'][number] {
  if (!m.options) return m;
  const options = m.options
    .slice(0, 3)
    .map((o) => ({ items: o.items.slice(0, 30).map((i) => cut(i, 200)).filter(Boolean) }))
    .filter((o) => o.items.length > 0);
  const rest = { ...m };
  delete rest.options;
  return options.length > 0 ? { ...rest, options } : rest;
}

function cleanExtras(x: ShareExtras): ShareExtras {
  const out: ShareExtras = {};
  if (x.lang === 'en') out.lang = 'en';
  if (x.goal?.title) out.goal = x.goal.note ? { title: cut(x.goal.title, 80), note: cut(x.goal.note, 500) } : { title: cut(x.goal.title, 80) };
  if (x.targets) {
    const t = x.targets;
    const targets: NonNullable<ShareExtras['targets']> = {};
    const set = (k: keyof typeof targets, v: number | undefined, max: number) => {
      const n = num(v, 0, max);
      if (n !== undefined) targets[k] = Math.round(n);
    };
    set('kcal', t.kcal, 20_000);
    set('proteinG', t.proteinG, 2000);
    set('carbG', t.carbG, 3000);
    set('fatG', t.fatG, 2000);
    set('waterMinMl', t.waterMinMl, 20_000);
    set('waterMaxMl', t.waterMaxMl, 20_000);
    if (Object.keys(targets).length > 0) out.targets = targets;
  }
  if (x.mealDays?.length) {
    out.mealDays = x.mealDays.slice(0, 7).map((d) => {
      const day: NonNullable<ShareExtras['mealDays']>[number] = { title: cut(d.title, 80), meals: d.meals.slice(0, 12).map(cleanMeal) };
      const k = num(d.kcal, 0, 20_000);
      if (k !== undefined) day.kcal = Math.round(k);
      return day;
    });
  }
  if (x.progress?.length) {
    out.progress = x.progress.slice(0, 7).map((p) => ({ key: p.key, points: p.points.filter((q) => DATE.test(q.d) && num(q.v, 0, 1000) !== undefined).slice(-60) }));
  }
  if (x.records?.length) out.records = x.records.filter((r) => r.name && DATE.test(r.d) && num(r.weightKg, 0, 1000) !== undefined && num(r.reps, 0, 1000) !== undefined).slice(0, 12).map((r) => ({ ...r, name: cut(r.name, 120) }));
  if (x.sessions) out.sessions = x.sessions.filter((q) => num(q.at, 0, 1e11) !== undefined && num(q.durationMin, 5, 480) !== undefined).slice(0, 5);
  if (x.package && num(x.package.left, 0, 1000) !== undefined && num(x.package.total, 0, 1000) !== undefined) {
    out.package = x.package.endDate && DATE.test(x.package.endDate) ? { ...x.package } : { left: x.package.left, total: x.package.total };
  }
  const attended = num(x.attended, 0, 100_000);
  if (attended !== undefined) out.attended = attended;
  const next = num(x.nextDay, 0, 13);
  if (next !== undefined) out.nextDay = Math.floor(next);
  const streak = num(x.streakWeeks, 0, 520);
  if (streak !== undefined) out.streakWeeks = streak;
  if (x.checkins) out.checkins = x.checkins.filter((c) => DATE.test(c.d)).slice(0, 12);
  if (x.startDate && DATE.test(x.startDate)) out.startDate = x.startDate;
  return out;
}

/** Builds the page content. Only the client's first name leaves the device, and only inside the envelope. */
export function buildShareDocument(s: ShareSources): ShareDocumentV1 {
  const firstName = cut(s.client.name.split(/\s+/)[0] ?? '', 40);
  const days = (s.program?.days ?? []).slice(0, 14).map((d, i) => ({
    title: cut(s.dayTitle(i, d.name), 80),
    exercises: d.items.slice(0, 40).map((it) => {
      const ex = s.exercise(it.exerciseId);
      const out: ShareDocumentV1['days'][number]['exercises'][number] = { name: cut(ex.name, 120) || '—', sets: it.sets, reps: cut(it.reps, 20) };
      if (it.restSec > 0) out.restSec = Math.min(3600, it.restSec);
      if (it.tempo) out.tempo = cut(it.tempo, 20);
      if (it.rpe !== null) out.rpe = it.rpe;
      if (ex.imageFile && IMAGE_FILE.test(ex.imageFile)) out.image = ex.imageFile;
      const notes = mergeItemNotes(it.notes, ex.note ?? '');
      if (notes) out.notes = cut(notes, 500);
      return out;
    }),
  }));
  const meals = (s.mealPlan?.meals ?? []).slice(0, 12).map((m) => {
    const meal: ShareDocumentV1['meals'][number] = { title: cut(m.name, 80) || '—', items: m.items.slice(0, 30).map((i) => cut(s.mealItem(i), 200)).filter(Boolean) };
    if (m.time) meal.time = cut(m.time, 20);
    const options = (m.options ?? []).slice(0, 3).map((o) => ({ items: o.items.slice(0, 30).map((i) => cut(s.mealItem(i), 200)).filter(Boolean) }));
    return cleanMeal(options.length > 0 ? { ...meal, options } : meal);
  });
  const doc: ShareDocumentV1 = {
    v: 1,
    updatedAt: Math.floor(s.now / 1000),
    brand: { name: cut(s.trainerName, 80) || '—', color: COLOR.test(s.color) ? s.color : '#333333' },
    client: { firstName: firstName || '—' },
    days,
    meals,
    supplements: s.supplements.slice(0, 30).map((x) => ({ name: cut(x.name, 120), text: cut([x.dose, x.timing, x.notes].filter((t) => t.trim()).join(' · '), 500) })),
    notes: cut(s.notes, 4000),
    checkinsEnabled: s.checkinsEnabled,
  };
  if (s.program) doc.programTitle = cut(s.program.name, 80);
  if (s.logo && LOGO.test(s.logo) && s.logo.length <= 100_000) doc.brand.logo = s.logo;
  return s.extras ? { ...doc, ...cleanExtras(s.extras) } : doc;
}

const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Same guard as the Worker's parseCheckinDocument: anything unexpected → null. */
export function parseCheckin(value: unknown): CheckinDocumentV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || v.kind !== 'checkin' || !inRange(v.createdAt, 0, 1e11)) return null;
  const out: CheckinDocumentV1 = { v: 1, kind: 'checkin', createdAt: Math.floor(v.createdAt) };
  if (v.weightKg !== undefined) {
    if (!inRange(v.weightKg, 20, 400)) return null;
    out.weightKg = v.weightKg;
  }
  if (v.waistCm !== undefined) {
    if (!inRange(v.waistCm, 30, 300)) return null;
    out.waistCm = v.waistCm;
  }
  if (v.notes !== undefined) {
    if (typeof v.notes !== 'string' || v.notes.length > 1000) return null;
    out.notes = v.notes;
  }
  if (v.photo !== undefined) {
    if (typeof v.photo !== 'string' || !PHOTO.test(v.photo) || v.photo.length > 4_000_000) return null;
    out.photo = v.photo;
  }
  if (v.photos !== undefined) {
    if (!Array.isArray(v.photos) || v.photos.length > 2 || !v.photos.every((p) => typeof p === 'string' && PHOTO.test(p) && p.length <= 4_000_000)) return null;
    out.photos = v.photos as string[];
  }
  const ranges: Array<[keyof CheckinDocumentV1 & ('hipCm' | 'chestCm' | 'armCm' | 'thighCm' | 'sleepHours' | 'energy' | 'adherence'), number, number]> = [
    ['hipCm', 30, 300],
    ['chestCm', 30, 300],
    ['armCm', 10, 150],
    ['thighCm', 20, 200],
    ['sleepHours', 0, 24],
    ['energy', 1, 5],
    ['adherence', 0, 100],
  ];
  for (const [k, min, max] of ranges) {
    if (v[k] === undefined) continue;
    if (!inRange(v[k], min, max)) return null;
    if (k === 'energy' && !Number.isInteger(v[k])) return null;
    out[k] = v[k];
  }
  return out;
}
