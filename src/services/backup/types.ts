import type { BackupKind, BackupManifest, ImageVariant } from '@/domain/backup';
import type { Result } from '@/domain/nutrition/result';
import type { BackupStatus } from '@/data/backupMeta';

export type BackupPhase = 'tables' | 'images' | 'finalize' | 'encrypt' | 'decrypt' | 'read' | 'verify' | 'migrate' | 'write';

export interface BackupProgress {
  phase: BackupPhase;
  done: number;
  total: number;
}

export type ProgressListener = (p: BackupProgress) => void;

export type ExportError = 'cancelled' | 'read_failed' | 'invalid_image_id' | 'weak_password' | 'encrypt_failed';

export type ImportError =
  | 'not_a_backup'
  | 'password_required'
  | 'wrong_password'
  | 'unsupported_format'
  | 'malformed'
  | 'checksum_mismatch'
  | 'missing_file'
  | 'unexpected_file'
  | 'too_large'
  | 'newer_schema'
  | 'migration_failed'
  | 'write_failed'
  | 'cancelled'
  /** A photo archive was given to the full restore (it would replace all data with photos only). */
  | 'photo_archive'
  /** A full backup was given to the photo-archive restore. */
  | 'not_a_photo_archive';

export interface ExportedArchive {
  blob: Blob;
  manifest: BackupManifest;
  /** Images left out because a thumbnail could not be made (thumbnail variant only). */
  skippedImages: number;
}

export interface BackupFile {
  blob: Blob;
  fileName: string;
  mimeType: string;
  encrypted: boolean;
  manifest: BackupManifest;
}

export interface ImportSummary {
  kind: BackupKind;
  /** Photo archives only. */
  archiveId: string | null;
  /** Rows restored per table (images = photos restored). */
  counts: Record<string, number>;
  schemaVersion: number;
  /** Older schema version the backup was migrated from, or null. */
  migratedFrom: number | null;
  imageVariant: ImageVariant;
  createdAt: number;
  appVersion: string;
}

export type BackupFileKind = 'encrypted' | 'zip' | 'unknown';

export interface ExportOptions {
  /** Encrypt the file with this password (PTP1 envelope). Omit/null for a plain .zip. */
  password?: string | null;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
}

export interface ImportOptions {
  password?: string | null;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
}

/** Local backup file: what the Settings/Backup screen calls. Never throws. */
export interface BackupService {
  exportFile(options?: ExportOptions): Promise<Result<BackupFile, ExportError>>;
  detectFile(file: Blob): Promise<BackupFileKind>;
  /** Integrity check of a finished file (decrypt + every checksum), writing nothing. */
  verifyFile(file: Blob, password: string | null): Promise<Result<ImportSummary, ImportError>>;
  /** Replaces ALL data with the backup's (all-or-nothing). Ask the trainer to confirm first. */
  importFile(file: Blob, options?: ImportOptions): Promise<Result<ImportSummary, ImportError>>;
  /**
   * Call only after the share sheet / save picker finished, or the trainer confirmed a download landed
   * (`shouldRecordSave`), so the weekly reminder resets.
   */
  recordSaved(at: number, details?: { bytes?: number; how?: 'shared' | 'saved' | 'downloaded' }): Promise<void>;
  status(): Promise<BackupStatus>;
  snooze(until: number): Promise<void>;
  setFileEncrypted(encrypted: boolean): Promise<void>;
}

export const MIN_BACKUP_PASSWORD_LENGTH = 8;
