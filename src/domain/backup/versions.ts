/** Backup copies kept in Google Drive (and the "when was the last backup" rule shared by Home and Settings). */

export const DEFAULT_DRIVE_KEEP_VERSIONS = 5;
export const MAX_DRIVE_KEEP_VERSIONS = 30;

export interface StoredVersion {
  id: string;
  /** Epoch ms. */
  createdAt: number;
}

/** Newest first. Ties keep their input order. */
export function sortNewestFirst<T extends StoredVersion>(versions: readonly T[]): T[] {
  return versions
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v.createdAt - a.v.createdAt || a.i - b.i)
    .map((x) => x.v);
}

/**
 * Which copies to delete so only the newest `keep` stay. `justUploadedId` is never deleted, even if the
 * phone's clock is behind the server's.
 */
export function versionsToPrune<T extends StoredVersion>(versions: readonly T[], keep: number, justUploadedId?: string): T[] {
  const limit = Math.min(MAX_DRIVE_KEEP_VERSIONS, Math.max(1, Math.floor(keep)));
  const others = sortNewestFirst(versions.filter((v) => v.id !== justUploadedId));
  const room = justUploadedId !== undefined && versions.some((v) => v.id === justUploadedId) ? limit - 1 : limit;
  return others.slice(Math.max(0, room));
}

export interface BackupTimes {
  lastLocalAt: number | null;
  lastCloudAt: number | null;
  lastDriveAt?: number | null;
}

export type BackupPlace = 'local' | 'cloud' | 'drive';

/** The most recent backup of any kind, or null when there never was one. */
export function latestBackup(times: BackupTimes): { at: number; place: BackupPlace } | null {
  const candidates: Array<{ at: number | null | undefined; place: BackupPlace }> = [
    { at: times.lastLocalAt, place: 'local' },
    { at: times.lastCloudAt, place: 'cloud' },
    { at: times.lastDriveAt, place: 'drive' },
  ];
  let best: { at: number; place: BackupPlace } | null = null;
  for (const c of candidates) {
    if (typeof c.at === 'number' && c.at > 0 && (best === null || c.at > best.at)) best = { at: c.at, place: c.place };
  }
  return best;
}

export const REMINDER_DAY_CHOICES: readonly number[] = [3, 7, 14];
