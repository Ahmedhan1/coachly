import type { AppDatabase } from '@/data/db';
import { dexieBackupMetaStore, type BackupMetaStore } from '@/data/backupMeta';
import { imageStats, snapshotTables } from '@/data/backupIO';
import type { CloudSizeEstimate } from '@/domain/backup';
import { BrowserNetworkStatus } from '@/services/cloud/networkStatus';
import { HttpCloudBackupClient } from '@/services/cloud/httpCloudBackupClient';
import type { CloudBackupClient, NetworkStatus, TokenProvider } from '@/services/cloud/types';
import type { ImageDownscaler, StorageService } from '@/services/storage/types';
import { BrowserStorageService } from '@/services/storage/browserStorageService';
import { StorageCleanupService } from '@/services/storage/storageReport';
import { PhotoArchiveService } from './photoArchive';
import { watchDataChanges } from './changeHooks';
import { CloudRestoreService } from './cloudRestore';
import { exportArchive } from './exporter';
import { importArchive } from './importer';
import { LocalBackupService } from './localBackupService';
import { BackupScheduler, type BackupPasswordProvider, type BackupSchedulerConfig, type Timers } from './scheduler';

export interface BackupServicesOptions {
  db: AppDatabase;
  appVersion: string;
  tokens: TokenProvider;
  passwords: BackupPasswordProvider;
  /** Makes cloud thumbnails (services/storage CanvasImageDownscaler in the app). */
  downscaler: ImageDownscaler;
  workerBaseUrl?: string;
  client?: CloudBackupClient;
  network?: NetworkStatus;
  meta?: BackupMetaStore;
  timers?: Timers;
  now?: () => number;
  schedulerConfig?: Partial<BackupSchedulerConfig>;
  /** navigator.storage wrapper for the storage screen (default: the browser's). */
  storage?: StorageService;
}

export interface BackupServices {
  local: LocalBackupService;
  scheduler: BackupScheduler;
  cloud: CloudRestoreService;
  meta: BackupMetaStore;
  /** «أرشفة الصور القديمة»: old photos → device file → placeholders; restore brings them back. */
  archive: PhotoArchiveService;
  /** Settings → التخزين: usage report, persistence, unused-photo cleanup, shrinking big photos. */
  storage: StorageCleanupService;
  /** Starts the scheduler and the change hooks. Returns a stop function. */
  start(): () => void;
}

/** Rough compressed size of the table JSON, for choosing the cloud photo variant before exporting. */
export async function estimateCloudSize(db: AppDatabase): Promise<CloudSizeEstimate> {
  const snapshot = await snapshotTables(db);
  const json = JSON.stringify(snapshot.tables).length;
  const images = await imageStats(db);
  return { dataBytes: Math.ceil(json / 3), imageCount: images.count, fullImageBytes: images.bytes };
}

/** Wires the real implementations together. The UI calls this once at startup. */
export function createBackupServices(o: BackupServicesOptions): BackupServices {
  const now = o.now ?? (() => Date.now());
  const meta = o.meta ?? dexieBackupMetaStore(o.db);
  const network = o.network ?? new BrowserNetworkStatus();
  const client = o.client ?? new HttpCloudBackupClient({ baseUrl: o.workerBaseUrl, network });
  const local = new LocalBackupService({ db: o.db, meta, appVersion: o.appVersion, now: () => new Date(now()) });
  const scheduler = new BackupScheduler({
    exportArchive: (variant) =>
      exportArchive(o.db, { appVersion: o.appVersion, now: new Date(now()), imageVariant: variant, downscaler: o.downscaler }),
    estimate: () => estimateCloudSize(o.db),
    client,
    tokens: o.tokens,
    passwords: o.passwords,
    meta,
    network,
    timers: o.timers,
    now,
    config: o.schedulerConfig,
  });
  const archive = new PhotoArchiveService({
    db: o.db,
    downscaler: o.downscaler,
    appVersion: o.appVersion,
    now: () => new Date(now()),
    openFile: (file, opts) => local.openFile(file, opts),
  });
  const storage = new StorageCleanupService({ db: o.db, storage: o.storage ?? new BrowserStorageService(), images: o.downscaler, now: () => new Date(now()) });
  const cloud = new CloudRestoreService({ client, tokens: o.tokens, importZip: (zip, opts) => importArchive(o.db, zip, opts) });
  return {
    local,
    scheduler,
    cloud,
    meta,
    archive,
    storage,
    start: () => {
      void scheduler.start();
      const unwatch = watchDataChanges(o.db, () => scheduler.notifyChange());
      return () => {
        unwatch();
        scheduler.stop();
      };
    },
  };
}
