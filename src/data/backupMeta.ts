import type { ImageVariant } from '@/domain/backup';
import type { AppDatabase } from './db';

/** Backup bookkeeping for this device (Home screen "last backup", weekly reminder, scheduler state). */
export interface BackupStatus {
  /** Last local backup file the trainer saved/shared (epoch ms). */
  lastLocalAt: number | null;
  /** Last successful cloud upload. */
  lastCloudAt: number | null;
  lastCloudBytes: number | null;
  lastCloudVariant: ImageVariant | null;
  /** Error code of the last failed cloud attempt, cleared on success. */
  lastCloudError: string | null;
  lastCloudErrorAt: number | null;
  /** Set when data changed and no cloud backup has covered it yet; survives reloads. */
  dirtySince: number | null;
  /** Largest photo variant the cloud accepts right now (lowered after `storage_full`). */
  cloudCeiling: ImageVariant;
  /** "Remind me later" for the weekly reminder. */
  reminderSnoozedUntil: number | null;
  /** Remind after this many days without any backup (Settings choice, default 7). */
  reminderDays: number;
  /** Last successful Google Drive upload (verified before upload). */
  lastDriveAt: number | null;
  lastDriveBytes: number | null;
  lastDriveError: string | null;
  /** Data changed since the last Drive copy; the Drive auto-backup picks it up. */
  driveDirtySince: number | null;
  /** The trainer connected Google Drive on this device (the access token itself is never stored). */
  driveConnected: boolean;
  /** How many Drive copies to keep. */
  driveKeep: number;
}

export const EMPTY_BACKUP_STATUS: BackupStatus = {
  lastLocalAt: null,
  lastCloudAt: null,
  lastCloudBytes: null,
  lastCloudVariant: null,
  lastCloudError: null,
  lastCloudErrorAt: null,
  dirtySince: null,
  cloudCeiling: 'full',
  reminderSnoozedUntil: null,
  reminderDays: 7,
  lastDriveAt: null,
  lastDriveBytes: null,
  lastDriveError: null,
  driveDirtySince: null,
  driveConnected: false,
  driveKeep: 5,
};

export interface BackupMetaStore {
  get(): Promise<BackupStatus>;
  update(patch: Partial<BackupStatus>): Promise<BackupStatus>;
}

/** Device-local: the `backup.` prefix keeps it out of backups and untouched by restores. */
export const BACKUP_STATUS_KEY = 'backup.status';

export function dexieBackupMetaStore(db: AppDatabase): BackupMetaStore {
  const get = async (): Promise<BackupStatus> => {
    const value = (await db.meta.get(BACKUP_STATUS_KEY))?.value;
    return { ...EMPTY_BACKUP_STATUS, ...(typeof value === 'object' && value !== null ? (value as Partial<BackupStatus>) : {}) };
  };
  return {
    get,
    update: (patch) =>
      db.transaction('rw', db.meta, async () => {
        const next = { ...(await get()), ...patch };
        await db.meta.put({ key: BACKUP_STATUS_KEY, value: next });
        return next;
      }),
  };
}

export function memoryBackupMetaStore(initial: Partial<BackupStatus> = {}): BackupMetaStore {
  let state: BackupStatus = { ...EMPTY_BACKUP_STATUS, ...initial };
  return {
    get: async () => ({ ...state }),
    update: async (patch) => {
      state = { ...state, ...patch };
      return { ...state };
    },
  };
}
