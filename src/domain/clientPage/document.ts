import type { Client, MealPlan, Program } from '../models';

/** Mirror of worker/src/share/document.ts (ShareDocumentV1 / CheckinDocumentV1). Keep the two in sync. */
export interface ShareDocumentV1 {
  v: 1;
  updatedAt: number;
  brand: { name: string; color: string; logo?: string };
  client: { firstName: string };
  programTitle?: string;
  days: Array<{
    title: string;
    exercises: Array<{ name: string; sets?: number; reps?: string; restSec?: number; tempo?: string; rpe?: number; image?: string; notes?: string }>;
  }>;
  meals: Array<{ title: string; time?: string; items: string[]; notes?: string }>;
  supplements: Array<{ name: string; text: string }>;
  notes: string;
  checkinsEnabled: boolean;
}

export interface CheckinDocumentV1 {
  v: 1;
  kind: 'checkin';
  createdAt: number;
  weightKg?: number;
  waistCm?: number;
  notes?: string;
  photo?: string;
}

const cut = (s: string, n: number) => s.trim().slice(0, n);
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const IMAGE_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

export interface ShareSources {
  now: number;
  trainerName: string;
  color: string;
  client: Pick<Client, 'name'>;
  program: Program | null;
  /** Arabic name and (for built-in pack exercises) the photo file name inside /exercise-pack/img/. */
  exercise: (id: string) => { name: string; imageFile: string | null };
  dayTitle: (index: number, name: string) => string;
  mealPlan: MealPlan | null;
  /** Text for a meal item (recipe name or the free text) with its servings. */
  mealItem: (item: MealPlan['meals'][number]['items'][number]) => string;
  supplements: ReadonlyArray<{ name: string; dose: string; timing: string; notes: string }>;
  notes: string;
  checkinsEnabled: boolean;
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
      if (it.notes) out.notes = cut(it.notes, 500);
      return out;
    }),
  }));
  const meals = (s.mealPlan?.meals ?? []).slice(0, 12).map((m) => {
    const meal: ShareDocumentV1['meals'][number] = { title: cut(m.name, 80) || '—', items: m.items.slice(0, 30).map((i) => cut(s.mealItem(i), 200)).filter(Boolean) };
    if (m.time) meal.time = cut(m.time, 20);
    return meal;
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
  return doc;
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
  return out;
}
