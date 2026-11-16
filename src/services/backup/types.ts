import type { BackupManifest, ImageVariant } from '@/domain/backup';
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
  | 'cancelled';

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
  /** Replaces ALL data with the backup's (all-or-nothing). Ask the trainer to confirm first. */
  importFile(file: Blob, options?: ImportOptions): Promise<Result<ImportSummary, ImportError>>;
  /** Call after the share sheet / download reported success, so the weekly reminder resets. */
  recordSaved(at: number): Promise<void>;
  status(): Promise<BackupStatus>;
}

export const MIN_BACKUP_PASSWORD_LENGTH = 8;
