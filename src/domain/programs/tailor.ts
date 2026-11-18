import { injuredJoints, type FitProfile } from '../exercises/fit';
import type { Client, ClientExerciseNote } from '../models';

/** The fit rules' view of a client: their training profile, with joints from the old free-text injuries too. */
export function fitProfileOf(client: Pick<Client, 'injuries' | 'trainingProfile'>): FitProfile {
  const p = client.trainingProfile;
  const joints = injuredJoints(p, client.injuries);
  return {
    ...(p?.place ? { place: p.place } : {}),
    ...(p?.homeEquipment ? { homeEquipment: p.homeEquipment } : {}),
    ...(p?.level ? { level: p.level } : {}),
    ...(p?.emphasis ? { emphasis: p.emphasis } : {}),
    ...(p?.avoidIds ? { avoidIds: p.avoidIds } : {}),
    ...(p?.favouriteIds ? { favouriteIds: p.favouriteIds } : {}),
    injuredJoints: joints,
  };
}

/** True when the client has any profile data worth tailoring by (a place, level, injury, list…). */
export function hasTrainingProfile(client: Pick<Client, 'injuries' | 'trainingProfile'>): boolean {
  const f = fitProfileOf(client);
  return Boolean(f.place || f.level || f.emphasis || (f.injuredJoints?.length ?? 0) > 0 || (f.avoidIds?.length ?? 0) > 0 || (f.favouriteIds?.length ?? 0) > 0);
}

/** One line for the client's own note on an exercise: "cue · ≤ 20 kg". Empty when there is nothing. */
export function clientNoteText(entry: ClientExerciseNote | undefined, kgLabel: string): string {
  if (!entry) return '';
  const parts = [entry.note.trim()];
  if (typeof entry.maxKg === 'number' && entry.maxKg > 0) parts.push(`≤ ${Math.round(entry.maxKg * 10) / 10} ${kgLabel}`);
  return parts.filter(Boolean).join(' · ');
}

/** The program item's notes plus the client's own note (each once). */
export function mergeItemNotes(itemNotes: string, clientNote: string): string {
  const a = itemNotes.trim();
  const b = clientNote.trim();
  if (!b || a.includes(b)) return a;
  return a ? `${a}\n${b}` : b;
}

/** Sets a client's note on one exercise (empty note and no limit removes it). Returns the new map. */
export function setClientExerciseNote(
  notes: Readonly<Record<string, ClientExerciseNote>> | undefined,
  exerciseId: string,
  entry: ClientExerciseNote,
): Record<string, ClientExerciseNote> {
  const out = { ...(notes ?? {}) };
  const note = entry.note.trim();
  const maxKg = typeof entry.maxKg === 'number' && entry.maxKg > 0 ? entry.maxKg : null;
  if (!note && maxKg === null) delete out[exerciseId];
  else out[exerciseId] = { note, maxKg };
  return out;
}
