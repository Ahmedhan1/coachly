// The client-page document (feature 12): what the trainer's app encrypts into the PTK1 envelope at
// PUT /api/share/:shareId, and what the viewer page at /c/:shareId decrypts and renders.
// Plain TypeScript + a hand-written runtime guard (no zod) so the app can copy or import it as is.
// Every text is shown with textContent (never as HTML). Versioned: bump `v` for breaking changes.

export const SHARE_DOCUMENT_VERSION = 1;
export const CHECKIN_DOCUMENT_VERSION = 1;

export interface ShareBrand {
  /** Trainer / studio name shown at the top. ≤ 80 chars. */
  name: string;
  /** Brand colour `#RRGGBB`. */
  color: string;
  /** Optional small logo: `data:image/(png|jpeg|webp);base64,...`, ≤ 100 000 chars. */
  logo?: string;
}

export interface ShareExercise {
  /** Arabic (transliterated) exercise name as the trainer has it, e.g. "بنش برس". ≤ 120 chars. */
  name: string;
  sets?: number;
  /** Free text so ranges work: "8-10", "12", "30 ث". ≤ 20 chars. */
  reps?: string;
  restSec?: number;
  /** e.g. "3-1-1". ≤ 20 chars. */
  tempo?: string;
  /** 1–10, halves allowed. */
  rpe?: number;
  /** Image file name inside the app's `/exercise-pack/img/` (e.g. "0001-0.webp"). No slashes. */
  image?: string;
  /** Trainer's note for this exercise. ≤ 500 chars. */
  notes?: string;
  /** Optional second photo (end position), same rules as `image`. */
  image2?: string;
  /** Superset label shared by linked exercises, e.g. "A". ≤ 4 chars. */
  group?: string;
}

export interface ShareProgramDay {
  /** e.g. "اليوم 1 — بوش". ≤ 80 chars. */
  title: string;
  exercises: ShareExercise[];
}

export interface ShareMeal {
  /** e.g. "الفطار". ≤ 80 chars. */
  title: string;
  /** Optional time label, e.g. "9:00". ≤ 20 chars. */
  time?: string;
  /** One line per food item. Each ≤ 200 chars. */
  items: string[];
  notes?: string;
  /** Up to 3 other ways to eat this meal on the same numbers; the client picks one (older viewers ignore it). */
  options?: Array<{ items: string[] }>;
}

export interface ShareSupplement {
  /** Product name as the trainer wrote it. ≤ 120 chars. */
  name: string;
  /** Trainer-written text only (the app never suggests doses). ≤ 500 chars. */
  text: string;
}

/** A meal-plan day (the trainer can build several days of meals). */
export interface ShareMealDay {
  /** e.g. "اليوم 1". ≤ 80 chars. */
  title: string;
  /** Planned calories for that day, when the trainer set a target. */
  kcal?: number;
  meals: ShareMeal[];
}

/** Daily targets from the trainer's calculator (rounded). */
export interface ShareTargets {
  kcal?: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  /** Water range in ml. */
  waterMinMl?: number;
  waterMaxMl?: number;
}

export type ShareSeriesKey = 'weight' | 'waist' | 'bodyFat' | 'hip' | 'chest' | 'arm' | 'thigh';

/** One measurement over time (oldest first). `d` = local date YYYY-MM-DD. */
export interface ShareSeries {
  key: ShareSeriesKey;
  points: Array<{ d: string; v: number }>;
}

/** A best lift, shown to motivate the client. */
export interface ShareRecord {
  /** Exercise name (transliterated). ≤ 120 chars. */
  name: string;
  weightKg: number;
  reps: number;
  /** YYYY-MM-DD */
  d: string;
}

export interface ShareDocumentV1 {
  v: 1;
  /** Unix seconds of the trainer's last change. */
  updatedAt: number;
  brand: ShareBrand;
  /** First name only. ≤ 40 chars. */
  client: { firstName: string };
  /** Optional program title, e.g. "برنامج 4 أيام". ≤ 80 chars. */
  programTitle?: string;
  days: ShareProgramDay[];
  meals: ShareMeal[];
  supplements: ShareSupplement[];
  /** General notes from the trainer. ≤ 4000 chars. */
  notes: string;
  /** Show the weekly check-in form. */
  checkinsEnabled: boolean;
  // ── Optional additions (still version 1: older viewers ignore them) ──
  /** Goal title (e.g. "خسارة دهون") and the trainer's goal note. */
  goal?: { title: string; note?: string };
  targets?: ShareTargets;
  /** All meal-plan days; when present the viewer shows these instead of `meals`. */
  mealDays?: ShareMealDay[];
  progress?: ShareSeries[];
  records?: ShareRecord[];
  /** Upcoming sessions (unix seconds), soonest first. The viewer shows the first one still in the future. */
  sessions?: Array<{ at: number; durationMin: number }>;
  /** Package sessions left / total, and the subscription end date (YYYY-MM-DD). */
  package?: { left: number; total: number; endDate?: string };
  /** Sessions attended so far. */
  attended?: number;
  /** Index (0-based) of the program day the client should do next. */
  nextDay?: number;
  /** Weeks in a row with at least one attended session. */
  streakWeeks?: number;
  /** The client's own check-ins as the trainer stored them, newest first. */
  checkins?: Array<{ d: string; weightKg?: number; waistCm?: number }>;
  /** Date of the first measurement (YYYY-MM-DD), for "since you started". */
  startDate?: string;
  /** The trainer's app language: 'en' shows the page LTR with English labels. Absent = Arabic. */
  lang?: 'ar' | 'en';
}

export type ShareDocument = ShareDocumentV1;

/** What the client's browser encrypts (same link key, PTK1) and POSTs to /api/share/:shareId/checkins. */
export interface CheckinDocumentV1 {
  v: 1;
  kind: 'checkin';
  /** Unix seconds, from the client's phone clock. */
  createdAt: number;
  weightKg?: number;
  waistCm?: number;
  /** ≤ 1000 chars. */
  notes?: string;
  /** `data:image/jpeg;base64,...`, downscaled in the browser to ≤ 1200 px on the long side. */
  photo?: string;
  /** Extra photos (same format), at most 2 more (front/side/back). */
  photos?: string[];
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  /** Average sleep last week, hours. */
  sleepHours?: number;
  /** 1 (very tired) … 5 (great), whole numbers. */
  energy?: number;
  /** How much of the plan was followed this week, 0–100 %. */
  adherence?: number;
}

export const LIMITS = {
  brandName: 80,
  logo: 100_000,
  firstName: 40,
  title: 80,
  exerciseName: 120,
  shortText: 20,
  note: 500,
  item: 200,
  notes: 4000,
  checkinNotes: 1000,
  days: 14,
  exercisesPerDay: 40,
  meals: 12,
  itemsPerMeal: 30,
  mealOptions: 3,
  supplements: 30,
  mealDays: 7,
  seriesPoints: 60,
  records: 12,
  sessions: 5,
  photos: 2,
  checkins: 12,
} as const;

export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;
export const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SERIES_KEYS: readonly ShareSeriesKey[] = ['weight', 'waist', 'bodyFat', 'hip', 'chest', 'arm', 'thigh'];

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, max: number, allowEmpty = true): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim() !== '');
}

function optStr(value: unknown, max: number): boolean {
  return value === undefined || str(value, max);
}

function optNum(value: unknown, min: number, max: number): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}

function arrayOf(value: unknown, max: number, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length <= max && value.every(guard);
}

function isImageFile(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && IMAGE_FILE_PATTERN.test(value) && !value.includes('..'));
}

function optArray(value: unknown, max: number, guard: (item: unknown) => boolean): boolean {
  return value === undefined || arrayOf(value, max, guard);
}

function isDate(value: unknown): boolean {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function isMealDay(value: unknown): boolean {
  return isObj(value) && str(value.title, LIMITS.title) && optNum(value.kcal, 0, 20_000) && arrayOf(value.meals, LIMITS.meals, isMeal);
}

function isSeries(value: unknown): boolean {
  return (
    isObj(value) &&
    typeof value.key === 'string' &&
    (SERIES_KEYS as readonly string[]).includes(value.key) &&
    arrayOf(value.points, LIMITS.seriesPoints, (p) => isObj(p) && isDate(p.d) && optNum(p.v, 0, 1000) && p.v !== undefined)
  );
}

function isRecord(value: unknown): boolean {
  return isObj(value) && str(value.name, LIMITS.exerciseName, false) && optNum(value.weightKg, 0, 1000) && value.weightKg !== undefined && optNum(value.reps, 0, 1000) && value.reps !== undefined && isDate(value.d);
}

function isOptionalExtras(value: Obj): boolean {
  const goal = value.goal;
  const targets = value.targets;
  const pkg = value.package;
  return (
    (goal === undefined || (isObj(goal) && str(goal.title, LIMITS.title) && optStr(goal.note, LIMITS.note))) &&
    (targets === undefined ||
      (isObj(targets) &&
        optNum(targets.kcal, 0, 20_000) &&
        optNum(targets.proteinG, 0, 2000) &&
        optNum(targets.carbG, 0, 3000) &&
        optNum(targets.fatG, 0, 2000) &&
        optNum(targets.waterMinMl, 0, 20_000) &&
        optNum(targets.waterMaxMl, 0, 20_000))) &&
    optArray(value.mealDays, LIMITS.mealDays, isMealDay) &&
    optArray(value.progress, SERIES_KEYS.length, isSeries) &&
    optArray(value.records, LIMITS.records, isRecord) &&
    optArray(value.sessions, LIMITS.sessions, (x) => isObj(x) && optNum(x.at, 0, 1e11) && x.at !== undefined && optNum(x.durationMin, 5, 480) && x.durationMin !== undefined) &&
    (pkg === undefined || (isObj(pkg) && optNum(pkg.left, 0, 1000) && pkg.left !== undefined && optNum(pkg.total, 0, 1000) && pkg.total !== undefined && (pkg.endDate === undefined || isDate(pkg.endDate)))) &&
    optNum(value.attended, 0, 100_000) &&
    optNum(value.nextDay, 0, LIMITS.days - 1) &&
    optNum(value.streakWeeks, 0, 520) &&
    optArray(value.checkins, LIMITS.checkins, (c) => isObj(c) && isDate(c.d) && optNum(c.weightKg, 20, 400) && optNum(c.waistCm, 30, 300)) &&
    (value.startDate === undefined || isDate(value.startDate)) &&
    (value.lang === undefined || value.lang === 'ar' || value.lang === 'en')
  );
}

function isExercise(value: unknown): boolean {
  if (!isObj(value)) return false;
  return (
    str(value.name, LIMITS.exerciseName, false) &&
    optNum(value.sets, 1, 100) &&
    optStr(value.reps, LIMITS.shortText) &&
    optNum(value.restSec, 0, 3600) &&
    optStr(value.tempo, LIMITS.shortText) &&
    optNum(value.rpe, 1, 10) &&
    (value.image === undefined || (typeof value.image === 'string' && IMAGE_FILE_PATTERN.test(value.image) && !value.image.includes('..'))) &&
    optStr(value.notes, LIMITS.note) &&
    isImageFile(value.image2) &&
    optStr(value.group, 4)
  );
}

function isDay(value: unknown): boolean {
  return isObj(value) && str(value.title, LIMITS.title) && arrayOf(value.exercises, LIMITS.exercisesPerDay, isExercise);
}

function isMeal(value: unknown): boolean {
  return (
    isObj(value) &&
    str(value.title, LIMITS.title, false) &&
    optStr(value.time, LIMITS.shortText) &&
    arrayOf(value.items, LIMITS.itemsPerMeal, (item) => str(item, LIMITS.item)) &&
    optStr(value.notes, LIMITS.note) &&
    optArray(value.options, LIMITS.mealOptions, (o) => isObj(o) && arrayOf(o.items, LIMITS.itemsPerMeal, (item) => str(item, LIMITS.item)))
  );
}

function isSupplement(value: unknown): boolean {
  return isObj(value) && str(value.name, LIMITS.exerciseName, false) && str(value.text, LIMITS.note);
}

function isBrand(value: unknown): boolean {
  return (
    isObj(value) &&
    str(value.name, LIMITS.brandName) &&
    typeof value.color === 'string' &&
    COLOR_PATTERN.test(value.color) &&
    (value.logo === undefined || (typeof value.logo === 'string' && value.logo.length <= LIMITS.logo && LOGO_PATTERN.test(value.logo)))
  );
}

/** Runtime guard: returns the document when it matches version 1 exactly as documented, else null. */
export function parseShareDocument(value: unknown): ShareDocument | null {
  if (!isObj(value) || value.v !== SHARE_DOCUMENT_VERSION) return null;
  const ok =
    typeof value.updatedAt === 'number' &&
    Number.isInteger(value.updatedAt) &&
    value.updatedAt >= 0 &&
    isBrand(value.brand) &&
    isObj(value.client) &&
    str(value.client.firstName, LIMITS.firstName) &&
    optStr(value.programTitle, LIMITS.title) &&
    arrayOf(value.days, LIMITS.days, isDay) &&
    arrayOf(value.meals, LIMITS.meals, isMeal) &&
    arrayOf(value.supplements, LIMITS.supplements, isSupplement) &&
    str(value.notes, LIMITS.notes) &&
    typeof value.checkinsEnabled === 'boolean' &&
    isOptionalExtras(value);
  return ok ? (value as unknown as ShareDocument) : null;
}

/** Runtime guard for a decrypted check-in (the app should run it before storing anything). */
export function parseCheckinDocument(value: unknown): CheckinDocumentV1 | null {
  if (!isObj(value) || value.v !== CHECKIN_DOCUMENT_VERSION || value.kind !== 'checkin') return null;
  const ok =
    typeof value.createdAt === 'number' &&
    Number.isInteger(value.createdAt) &&
    optNum(value.weightKg, 20, 400) &&
    optNum(value.waistCm, 30, 300) &&
    optStr(value.notes, LIMITS.checkinNotes) &&
    (value.photo === undefined || (typeof value.photo === 'string' && PHOTO_PATTERN.test(value.photo))) &&
    optArray(value.photos, LIMITS.photos, (p) => typeof p === 'string' && PHOTO_PATTERN.test(p)) &&
    optNum(value.hipCm, 30, 300) &&
    optNum(value.chestCm, 30, 300) &&
    optNum(value.armCm, 10, 150) &&
    optNum(value.thighCm, 20, 200) &&
    optNum(value.sleepHours, 0, 24) &&
    (value.energy === undefined || (Number.isInteger(value.energy) && optNum(value.energy, 1, 5))) &&
    optNum(value.adherence, 0, 100);
  return ok ? (value as unknown as CheckinDocumentV1) : null;
}
