import type { Env } from '../env';
import { FILE_MAX_BYTES } from '../../../shared/files';
import { MemoryObjectStore, R2ObjectStore, S3ObjectStore, type ObjectStore } from '../files/objectStore';
import type { CloudConfig, FilesDeps } from '../ports';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/**
 * Push messages per cron run (docs/CLOUD.md, "Push CPU budget"). Measured: one encryption ~0.17 ms and one
 * VAPID signature ~0.035 ms inside workerd (~0.93 ms / 0.12 ms in Node with its thread-pool overhead).
 * 20 sends ~ 3.5 ms of crypto, about a third of the 10 ms Free-plan CPU limit; subrequests 1 + 20 + 1 of 50.
 */
export const PUSH_BATCH_SIZE = 20;

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  backupMaxBytes: 100 * MiB,
  // The Free plan refuses request bodies over 100 MB; stay well under it and use multipart above this.
  singlePutMaxBytes: 90 * MiB,
  backupPartBytes: 10 * MiB,
  storageGuardBytes: 9 * GiB,
  shareMaxBytes: 5 * MiB,
  checkinMaxBytes: 3 * MiB,
  maxPendingCheckins: 20,
  maxSharesPerAccount: 200,
  // ~40 clients x (page + a few photo check-ins); bounds one account to ~2% of the 10 GB free R2.
  pagesAccountMaxBytes: 200 * MiB,
  pushBatchSize: PUSH_BATCH_SIZE,
};

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function cloudConfigFromEnv(env: Env, overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    ...DEFAULT_CLOUD_CONFIG,
    backupMaxBytes: positiveInt(env.BACKUP_MAX_BYTES, DEFAULT_CLOUD_CONFIG.backupMaxBytes),
    storageGuardBytes: positiveInt(env.STORAGE_GUARD_BYTES, DEFAULT_CLOUD_CONFIG.storageGuardBytes),
    ...overrides,
  };
}

/**
 * Cloud files store from the FILES_* settings. Without all five settings the files API is off (503), and the
 * rest of the Worker works as before.
 */
export function filesDepsFromEnv(env: Env, store?: ObjectStore | null): FilesDeps {
  const settings = {
    endpoint: env.FILES_ENDPOINT?.trim() ?? '',
    region: env.FILES_REGION?.trim() ?? '',
    bucket: env.FILES_BUCKET?.trim() ?? '',
    accessKeyId: env.FILES_ACCESS_KEY_ID?.trim() ?? '',
    secretAccessKey: env.FILES_SECRET_ACCESS_KEY?.trim() ?? '',
  };
  const configured = Object.values(settings).every((v) => v !== '');
  // iDrive e2 when its keys are set; otherwise the Worker's own R2 bucket (free, nothing to configure).
  const chosen = store !== undefined ? store : configured ? new S3ObjectStore(settings) : env.BACKUPS ? new R2ObjectStore(env.BACKUPS) : null;
  return {
    store: chosen,
    sharesR2: chosen instanceof R2ObjectStore,
    maxBytes: FILE_MAX_BYTES,
    clientMaxBytes: 4 * MiB,
    accountMaxBytes: positiveInt(env.FILES_ACCOUNT_MAX_BYTES, GiB),
    clientPendingMax: 20,
  };
}

export { MemoryObjectStore, R2ObjectStore };
