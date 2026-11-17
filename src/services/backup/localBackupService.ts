import { DEFAULT_PBKDF2_ITERATIONS, openWithPassword, sealWithPassword } from '../../../shared/envelope';
import { isChunkedEnvelope, openChunked, sealChunked } from './chunkedEnvelope';
import { backupFileName } from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { AppDatabase } from '@/data/db';
import type { BackupMetaStore, BackupStatus } from '@/data/backupMeta';
import type { TempDatabaseFactory } from '@/data/backupIO';
import type { Migration } from '@/data/schema';
import { exportArchive } from './exporter';
import { importArchive, verifyArchive } from './importer';
import {
  MIN_BACKUP_PASSWORD_LENGTH,
  type BackupFile,
  type BackupFileKind,
  type BackupService,
  type ExportError,
  type ExportOptions,
  type ImportError,
  type ImportOptions,
  type ImportSummary,
} from './types';

export const ZIP_MIME = 'application/zip';
export const ENCRYPTED_BACKUP_MIME = 'application/octet-stream';

export interface LocalBackupServiceDeps {
  db: AppDatabase;
  meta: BackupMetaStore;
  appVersion: string;
  now: () => Date;
  /** PBKDF2 iterations for new encrypted files (the count is stored in each file). */
  iterations?: number;
  migrations?: readonly Migration[];
  openTemp?: TempDatabaseFactory;
  /** PTB1 chunk size (tests use small chunks). */
  chunkBytes?: number;
}

const PTP1 = [0x50, 0x54, 0x50, 0x31];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

export async function detectBackupKind(file: Blob): Promise<BackupFileKind> {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (PTP1.every((b, i) => head[i] === b) || isChunkedEnvelope(head)) return 'encrypted';
    if (ZIP.every((b, i) => head[i] === b)) return 'zip';
  } catch {
    // unreadable file → unknown
  }
  return 'unknown';
}

/**
 * Seals a zip into the old single-message PTP1 envelope (whole zip in memory). Kept for the cloud copy (small,
 * thumbnails) and tests; device files use the chunked PTB1 envelope.
 */
export async function sealBackup(zip: Blob, password: string, iterations = DEFAULT_PBKDF2_ITERATIONS): Promise<Uint8Array> {
  return sealWithPassword(password, new Uint8Array(await zip.arrayBuffer()), iterations);
}

export type OpenBackupError = 'wrong_password' | 'not_a_backup';

export async function openBackup(envelope: Uint8Array, password: string): Promise<Result<Blob, OpenBackupError>> {
  const opened = await openWithPassword(password, envelope);
  if (!opened.ok) return err(opened.error === 'decrypt_failed' ? 'wrong_password' : 'not_a_backup');
  return ok(new Blob([opened.data as BlobPart], { type: ZIP_MIME }));
}

export class LocalBackupService implements BackupService {
  constructor(private readonly deps: LocalBackupServiceDeps) {}

  async exportFile(options: ExportOptions = {}): Promise<Result<BackupFile, ExportError>> {
    const password = options.password ?? null;
    if (password !== null && password.length < MIN_BACKUP_PASSWORD_LENGTH) return err('weak_password');
    const now = this.deps.now();
    const archive = await exportArchive(this.deps.db, {
      appVersion: this.deps.appVersion,
      now,
      imageVariant: 'full',
      onProgress: options.onProgress,
      signal: options.signal,
    });
    if (!archive.ok) return archive;
    const { manifest } = archive.value;
    if (password === null) {
      return ok({ blob: archive.value.blob, fileName: backupFileName(now, false), mimeType: ZIP_MIME, encrypted: false, manifest });
    }
    if (options.signal?.aborted) return err('cancelled');
    options.onProgress?.({ phase: 'encrypt', done: 0, total: 1 });
    try {
      const sealed = await sealChunked(archive.value.blob, password, {
        iterations: this.deps.iterations,
        chunkBytes: this.deps.chunkBytes,
        signal: options.signal,
        onProgress: (done, total) => options.onProgress?.({ phase: 'encrypt', done, total }),
      });
      return ok({ blob: sealed, fileName: backupFileName(now, true), mimeType: ENCRYPTED_BACKUP_MIME, encrypted: true, manifest });
    } catch {
      return err('encrypt_failed');
    }
  }

  detectFile(file: Blob): Promise<BackupFileKind> {
    return detectBackupKind(file);
  }

  /**
   * Re-opens a finished backup file exactly as a restore would (decrypt with the password, check every
   * file's SHA-256 against the manifest) without writing anything. Success is only shown after this passes.
   */
  async verifyFile(file: Blob, password: string | null): Promise<Result<ImportSummary, ImportError>> {
    const zip = await this.openFile(file, { password });
    if (!zip.ok) return zip;
    return verifyArchive(this.deps.db, zip.value, { migrations: this.deps.migrations });
  }

  /** Decrypts (when needed) to the plain zip. Public so the photo-archive restore can reuse it. */
  async openFile(file: Blob, options: ImportOptions): Promise<Result<Blob, ImportError>> {
    const kind = await detectBackupKind(file);
    if (kind === 'unknown') return err('not_a_backup');
    if (kind === 'zip') return ok(file);
    if (!options.password) return err('password_required');
    options.onProgress?.({ phase: 'decrypt', done: 0, total: 1 });
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (isChunkedEnvelope(head)) {
      const opened = await openChunked(file, options.password, {
        signal: options.signal,
        onProgress: (done, total) => options.onProgress?.({ phase: 'decrypt', done, total }),
      });
      return opened.ok ? opened : err(opened.error);
    }
    let envelope: Uint8Array;
    try {
      envelope = new Uint8Array(await file.arrayBuffer());
    } catch {
      return err('malformed');
    }
    const opened = await openBackup(envelope, options.password);
    if (!opened.ok) return opened;
    options.onProgress?.({ phase: 'decrypt', done: 1, total: 1 });
    return opened;
  }

  async importFile(file: Blob, options: ImportOptions = {}): Promise<Result<ImportSummary, ImportError>> {
    const opened = await this.openFile(file, options);
    if (!opened.ok) return opened;
    return importArchive(this.deps.db, opened.value, {
      migrations: this.deps.migrations,
      openTemp: this.deps.openTemp,
      onProgress: options.onProgress,
      signal: options.signal,
    });
  }

  async recordSaved(at: number, details: { bytes?: number; how?: 'shared' | 'saved' | 'downloaded' } = {}): Promise<void> {
    try {
      await this.deps.meta.update({ lastLocalAt: at, lastLocalBytes: details.bytes ?? null, lastLocalHow: details.how ?? null, reminderSnoozedUntil: null });
    } catch {
      // bookkeeping only; never fail the UI
    }
  }

  /** Status, stamping `firstUseAt` the first time so the weekly nudge waits a week on a fresh install. */
  async status(): Promise<BackupStatus> {
    try {
      const current = await this.deps.meta.get();
      if (current.firstUseAt !== null) return current;
      return await this.deps.meta.update({ firstUseAt: this.deps.now().getTime() });
    } catch {
      return this.deps.meta.get();
    }
  }

  async snooze(until: number): Promise<void> {
    try {
      await this.deps.meta.update({ reminderSnoozedUntil: until });
    } catch {
      // bookkeeping only
    }
  }

  async setFileEncrypted(encrypted: boolean): Promise<void> {
    try {
      await this.deps.meta.update({ fileEncrypted: encrypted });
    } catch {
      // bookkeeping only
    }
  }
}
