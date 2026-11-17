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
  /** First time this install looked at its backup status: the weekly nudge waits a week after it. */
  firstUseAt: number | null;
  /** Size and route of the last device file (shown in Settings). */
  lastLocalBytes: number | null;
  lastLocalHow: 'shared' | 'saved' | 'downloaded' | null;
  /** The trainer's choice for the one-tap device file: encrypted (password kept in `backup.filePassword`) or not. null = not chosen yet. */
  fileEncrypted: boolean | null;
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
  firstUseAt: null,
  lastLocalBytes: null,
  lastLocalHow: null,
  fileEncrypted: null,
};

export interface BackupMetaStore {
  get(): Promise<BackupStatus>;
  update(patch: Partial<BackupStatus>): Promise<BackupStatus>;
}

/** Known fields only, so fields of removed features (e.g. the dropped Google Drive copy) fall away. */
function pickKnown(stored: Partial<BackupStatus>): BackupStatus {
  const out: Record<string, unknown> = { ...EMPTY_BACKUP_STATUS };
  for (const key of Object.keys(EMPTY_BACKUP_STATUS)) if (key in stored) out[key] = (stored as Record<string, unknown>)[key];
  return out as unknown as BackupStatus;
}

/** Device-local (never inside a backup): password for the one-tap encrypted device file, if the trainer chose to keep it. */
export const FILE_PASSWORD_KEY = 'backup.filePassword';

/** Device-local: the `backup.` prefix keeps it out of backups and untouched by restores. */
export const BACKUP_STATUS_KEY = 'backup.status';

export function dexieBackupMetaStore(db: AppDatabase): BackupMetaStore {
  const get = async (): Promise<BackupStatus> => {
    const value = (await db.meta.get(BACKUP_STATUS_KEY))?.value;
    return pickKnown(typeof value === 'object' && value !== null ? (value as Partial<BackupStatus>) : {});
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
