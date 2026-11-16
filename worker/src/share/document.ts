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
}

export interface ShareSupplement {
  /** Product name as the trainer wrote it. ≤ 120 chars. */
  name: string;
  /** Trainer-written text only (the app never suggests doses). ≤ 500 chars. */
  text: string;
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
  supplements: 30,
} as const;

export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;
export const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

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
    optStr(value.notes, LIMITS.note)
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
    optStr(value.notes, LIMITS.note)
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
    typeof value.checkinsEnabled === 'boolean';
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
    (value.photo === undefined || (typeof value.photo === 'string' && PHOTO_PATTERN.test(value.photo)));
  return ok ? (value as unknown as CheckinDocumentV1) : null;
}
