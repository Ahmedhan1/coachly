import { sealWithPassword } from '../../../shared/envelope';
import {
  chooseCloudVariant,
  CLOUD_HARD_CAP_BYTES,
  DEFAULT_CLOUD_BUDGET_BYTES,
  downgradeVariant,
  smallerVariant,
  type CloudSizeEstimate,
  type ImageVariant,
} from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { BackupMetaStore } from '@/data/backupMeta';
import type { CloudBackupClient, CloudError, NetworkStatus, TokenProvider } from '@/services/cloud/types';
import type { ExportedArchive, ExportError } from './types';

/** Where the backup password comes from for automatic uploads. null = not set / not unlocked yet. */
export interface BackupPasswordProvider {
  getPassword(): Promise<string | null>;
}

export function memoryPasswordProvider(initial: string | null = null): BackupPasswordProvider & { set(p: string | null): void } {
  let password = initial;
  return {
    getPassword: async () => password,
    set: (p) => {
      password = p;
    },
  };
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const browserTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type SchedulerError = CloudError | ExportError | 'not_activated' | 'needs_password' | 'too_large' | 'unexpected';

export type SchedulerPhase = 'idle' | 'scheduled' | 'waiting_online' | 'running' | 'retry_wait' | 'stopped';

export interface SchedulerState {
  phase: SchedulerPhase;
  /** Changes not yet covered by a cloud backup. */
  dirty: boolean;
  lastSuccessAt: number | null;
  lastError: SchedulerError | null;
  nextAttemptAt: number | null;
  attempt: number;
}

export interface CloudBackupDone {
  bytes: number;
  variant: ImageVariant;
  at: number;
}

export interface BackupSchedulerConfig {
  /** Quiet time after the last change before uploading. */
  debounceMs: number;
  /** At most one upload per this interval (LIMITS.md: at most once per 6 h). */
  minIntervalMs: number;
  /** Delays between retries after a transient failure; the last one repeats. */
  retryDelaysMs: readonly number[];
  budgetBytes: number;
  hardCapBytes: number;
}

export const DEFAULT_SCHEDULER_CONFIG: BackupSchedulerConfig = {
  debounceMs: 2 * 60_000,
  minIntervalMs: 6 * 60 * 60_000,
  retryDelaysMs: [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000],
  budgetBytes: DEFAULT_CLOUD_BUDGET_BYTES,
  hardCapBytes: CLOUD_HARD_CAP_BYTES,
};

export interface BackupSchedulerDeps {
  exportArchive(variant: ImageVariant): Promise<Result<ExportedArchive, ExportError>>;
  estimate(): Promise<CloudSizeEstimate>;
  client: CloudBackupClient;
  tokens: TokenProvider;
  passwords: BackupPasswordProvider;
  meta: BackupMetaStore;
  network: NetworkStatus;
  timers?: Timers;
  now: () => number;
  seal?: (password: string, data: Uint8Array) => Promise<Uint8Array>;
  config?: Partial<BackupSchedulerConfig>;
}

const TRANSIENT: ReadonlySet<SchedulerError> = new Set(['offline', 'timeout', 'network', 'server', 'rate_limited', 'storage_unavailable', 'unexpected']);

/**
 * Automatic encrypted cloud backup. After changes it waits for quiet (debounce), for the network and for the
 * minimum interval, then exports, seals with the trainer's backup password and uploads. Transient failures
 * retry later with backoff; `storage_full` lowers the photo variant (full → thumbnails → data only).
 * Everything is async and failures are recorded, never thrown; it never blocks the UI.
 */
export class BackupScheduler {
  private readonly config: BackupSchedulerConfig;
  private readonly timers: Timers;
  private timer: unknown = null;
  private unsubscribeOnline: (() => void) | null = null;
  private running: Promise<Result<CloudBackupDone, SchedulerError>> | null = null;
  private changedDuringRun = false;
  /** Set by an attempt that hit storage_full and lowered the cloud photo variant: retry soon with less. */
  private loweredCeiling = false;
  private listeners = new Set<(s: SchedulerState) => void>();
  private state: SchedulerState = { phase: 'idle', dirty: false, lastSuccessAt: null, lastError: null, nextAttemptAt: null, attempt: 0 };

  constructor(private readonly deps: BackupSchedulerDeps) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...deps.config };
    this.timers = deps.timers ?? browserTimers;
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  subscribe(listener: (s: SchedulerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<SchedulerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) {
      try {
        l(this.getState());
      } catch {
        // a broken listener must not stop backups
      }
    }
  }

  /** Loads persisted state and resumes a pending backup after an app restart. */
  async start(): Promise<void> {
    this.unsubscribeOnline?.();
    this.unsubscribeOnline = this.deps.network.onOnline(() => {
      if (this.state.dirty && (this.state.phase === 'waiting_online' || this.state.phase === 'retry_wait')) {
        this.schedule(this.config.debounceMs / 4);
      }
    });
    try {
      const status = await this.deps.meta.get();
      this.set({ lastSuccessAt: status.lastCloudAt, dirty: status.dirtySince !== null, phase: 'idle' });
      if (status.dirtySince !== null) this.schedule(this.config.debounceMs);
    } catch {
      // meta unavailable: behave as a fresh start
    }
  }

  stop(): void {
    this.clearTimer();
    this.unsubscribeOnline?.();
    this.unsubscribeOnline = null;
    this.set({ phase: 'stopped', nextAttemptAt: null });
  }

  /** Call after any data change. Cheap and synchronous for the caller. */
  notifyChange(): void {
    if (this.state.phase === 'stopped') return;
    if (this.running) this.changedDuringRun = true;
    if (!this.state.dirty) {
      this.set({ dirty: true });
      void this.deps.meta.update({ dirtySince: this.deps.now() }).catch(() => undefined);
    }
    if (!this.running) this.schedule(this.config.debounceMs);
  }

  /** Waits for the attempt in progress, if any (tests, and the "backup now" button). */
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  /** Backs up immediately (ignores debounce and min interval). */
  runNow(): Promise<Result<CloudBackupDone, SchedulerError>> {
    this.clearTimer();
    return this.attempt();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number, phase: SchedulerPhase = 'scheduled'): void {
    this.clearTimer();
    const now = this.deps.now();
    let at = now + delayMs;
    if (phase === 'scheduled' && this.state.lastSuccessAt !== null) {
      at = Math.max(at, this.state.lastSuccessAt + this.config.minIntervalMs);
    }
    this.set({ phase, nextAttemptAt: at });
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.attempt();
    }, Math.max(0, at - now));
  }

  private attempt(): Promise<Result<CloudBackupDone, SchedulerError>> {
    if (this.running) return this.running;
    this.changedDuringRun = false;
    this.loweredCeiling = false;
    const run = this.execute()
      .catch((): Result<CloudBackupDone, SchedulerError> => err('unexpected'))
      .then(async (result) => {
        this.running = null;
        await this.afterRun(result);
        return result;
      });
    this.running = run;
    return run;
  }

  private async execute(): Promise<Result<CloudBackupDone, SchedulerError>> {
    if (!this.deps.network.isOnline()) return err('offline');
    this.set({ phase: 'running', nextAttemptAt: null });
    const token = await this.deps.tokens.getToken();
    if (!token) return err('not_activated');
    const password = await this.deps.passwords.getPassword();
    if (!password) return err('needs_password');

    const status = await this.deps.meta.get();
    let variant: ImageVariant | null = chooseCloudVariant(await this.deps.estimate(), this.config.budgetBytes, status.cloudCeiling);
    let archive: ExportedArchive | null = null;
    while (variant !== null) {
      const exported = await this.deps.exportArchive(variant);
      if (!exported.ok) return exported;
      archive = exported.value;
      if (archive.blob.size <= this.config.budgetBytes) break;
      const smaller = downgradeVariant(variant);
      if (smaller === null) break;
      variant = smaller;
    }
    if (!archive || variant === null) return err('unexpected');
    if (archive.blob.size > this.config.hardCapBytes) return err('too_large');

    const seal = this.deps.seal ?? ((p: string, d: Uint8Array) => sealWithPassword(p, d));
    const envelope = await seal(password, new Uint8Array(await archive.blob.arrayBuffer()));
    const uploaded = await this.deps.client.upload(token, envelope);
    if (!uploaded.ok) {
      if (uploaded.error === 'storage_full') {
        const lower = downgradeVariant(variant);
        if (lower) {
          await this.deps.meta.update({ cloudCeiling: smallerVariant(lower, status.cloudCeiling) });
          this.loweredCeiling = true;
        }
      }
      return err(uploaded.error);
    }
    return ok({ bytes: envelope.length, variant, at: this.deps.now() });
  }

  private async afterRun(result: Result<CloudBackupDone, SchedulerError>): Promise<void> {
    const now = this.deps.now();
    if (result.ok) {
      const stillDirty = this.changedDuringRun;
      await this.deps.meta
        .update({
          lastCloudAt: result.value.at,
          lastCloudBytes: result.value.bytes,
          lastCloudVariant: result.value.variant,
          lastCloudError: null,
          lastCloudErrorAt: null,
          dirtySince: stillDirty ? now : null,
        })
        .catch(() => undefined);
      this.set({ lastSuccessAt: result.value.at, lastError: null, attempt: 0, dirty: stillDirty, phase: 'idle', nextAttemptAt: null });
      if (stillDirty) this.schedule(this.config.debounceMs);
      return;
    }
    const error = result.error;
    await this.deps.meta.update({ lastCloudError: error, lastCloudErrorAt: now }).catch(() => undefined);
    if (this.state.phase === 'stopped') return;
    if (error === 'offline') {
      this.set({ lastError: error, phase: 'waiting_online', nextAttemptAt: null });
      return;
    }
    const canRetryLower = error === 'storage_full' && this.loweredCeiling;
    if (TRANSIENT.has(error) || canRetryLower) {
      const attempt = this.state.attempt + 1;
      const delays = this.config.retryDelaysMs;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 60_000;
      this.set({ lastError: error, attempt });
      this.schedule(canRetryLower ? 0 : delay, 'retry_wait');
      return;
    }
    // Needs the trainer (password, activation) or cannot shrink further: wait for the next change.
    this.set({ lastError: error, phase: 'idle', nextAttemptAt: null, attempt: 0 });
  }
}
