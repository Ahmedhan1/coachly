import { z } from 'zod';
import type { StorageCategory, StoredImageInfo } from './storage';

/**
 * «أرشفة الصور القديمة»: old client/progress photos move into a device file; the app keeps a small placeholder
 * (same image id, so every reference keeps working) and a registry of which archive file holds which photo.
 * Restoring that file puts the full photos back. Pure: the services layer does the I/O.
 */

const DAY_MS = 86_400_000;

export const ARCHIVE_MONTH_CHOICES: readonly number[] = [3, 6, 12];
export const DEFAULT_ARCHIVE_MONTHS = 6;
/** Placeholder kept in the app: longest side in px. */
export const PLACEHOLDER_MAX_SIDE = 320;
/** Photos this small are not worth archiving (the placeholder would save almost nothing). */
export const PLACEHOLDER_MIN_SAVING_BYTES = 60 * 1024;
/** A destructive step needs a device backup file saved within this window. */
export const FRESH_BACKUP_MS = DAY_MS;
/** Meta key of the registry. Not device-local: it travels in full backups together with the placeholders. */
export const ARCHIVE_REGISTRY_KEY = 'storage.photoArchives';

/** `months` whole calendar months before `now` (UTC), with the day clamped to the shorter month. */
export function archiveCutoff(now: Date, months: number): number {
  if (!Number.isInteger(months) || months < 1) throw new RangeError('months must be a positive integer');
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return target.getTime();
}

/**
 * Client and progress photos older than `months`, oldest first. Branding, exercise and food photos stay (the
 * PDF and the lists need them); unreferenced photos belong to the cleanup tool; placeholders are skipped.
 */
export function selectPhotosToArchive(
  images: readonly StoredImageInfo[],
  owners: ReadonlyMap<string, StorageCategory>,
  alreadyArchived: ReadonlySet<string>,
  now: Date,
  months: number,
): { ids: string[]; bytes: number } {
  const cutoff = archiveCutoff(now, months);
  const picked = images
    .filter((i) => owners.get(i.id) === 'clientPhotos' && !alreadyArchived.has(i.id) && i.createdAt < cutoff && i.bytes > PLACEHOLDER_MIN_SAVING_BYTES)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  return { ids: picked.map((i) => i.id), bytes: picked.reduce((s, i) => s + i.bytes, 0) };
}

const entrySchema = z.object({
  id: z.string().min(1).max(64),
  fileName: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  savedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  /** Photos still only in that file (restored ones are removed). */
  imageIds: z.array(z.string().min(1).max(64)),
  restoredAt: z.number().int().nonnegative().nullable(),
});

export type PhotoArchiveEntry = z.infer<typeof entrySchema>;

/** Never throws: an unreadable registry reads as empty (photos then simply look like normal photos). */
export function parseArchiveRegistry(value: unknown): PhotoArchiveEntry[] {
  const parsed = z.array(entrySchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function addArchiveEntry(registry: readonly PhotoArchiveEntry[], entry: PhotoArchiveEntry): PhotoArchiveEntry[] {
  return [...registry.filter((e) => e.id !== entry.id), entry];
}

export function archivedImageIds(registry: readonly PhotoArchiveEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of registry) for (const id of e.imageIds) ids.add(id);
  return ids;
}

export function archiveForImage(registry: readonly PhotoArchiveEntry[], imageId: string): PhotoArchiveEntry | null {
  return registry.find((e) => e.imageIds.includes(imageId)) ?? null;
}

/** The given photos have their full bytes back: drop them from every archive; an emptied archive is closed. */
export function markRestored(registry: readonly PhotoArchiveEntry[], restoredIds: readonly string[], at: number): PhotoArchiveEntry[] {
  const restored = new Set(restoredIds);
  return registry.map((e) => {
    const imageIds = e.imageIds.filter((id) => !restored.has(id));
    if (imageIds.length === e.imageIds.length) return e;
    return { ...e, imageIds, restoredAt: imageIds.length === 0 ? at : e.restoredAt };
  });
}

/** True when a device backup file was saved in the last day (and not "in the future": clock rollback). */
export function hasFreshBackup(lastLocalAt: number | null, now: Date, maxAgeMs = FRESH_BACKUP_MS): boolean {
  if (lastLocalAt === null) return false;
  const age = now.getTime() - lastLocalAt;
  return age >= 0 && age < maxAgeMs;
}
