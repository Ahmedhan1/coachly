import type { Env } from '../env';
import type { CloudConfig } from '../ports';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** Push messages per cron run. Chosen from the measured CPU cost in docs/CLOUD.md ("Push CPU budget"). */
export const PUSH_BATCH_SIZE = 25;

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  backupMaxBytes: 100 * MiB,
  // The Free plan refuses request bodies over 100 MB; stay well under it and use multipart above this.
  singlePutMaxBytes: 90 * MiB,
  backupPartBytes: 10 * MiB,
  storageGuardBytes: 9 * GiB,
  shareMaxBytes: 5 * MiB,
  checkinMaxBytes: 3 * MiB,
  maxPendingCheckins: 20,
  maxSharesPerLicense: 200,
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
