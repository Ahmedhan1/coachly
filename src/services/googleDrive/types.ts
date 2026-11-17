import type { Result } from '@/domain/nutrition/result';

/**
 * Optional Google Drive backup. Only encrypted backup files (PTP1 envelopes sealed on the phone with the
 * trainer's password) are ever uploaded. Every call fails quietly with one of these codes:
 * - not_configured: no OAuth Client ID in this build or in Settings
 * - needs_consent: no valid access token and the call was not started by a tap (cannot open Google's window)
 * - auth_cancelled: the trainer closed Google's window or did not allow Drive
 * - auth_failed: Google's script did not load or the window was blocked
 * - unauthorized: the token expired or was revoked (401)
 * - quota: the trainer's Google Drive is full
 */
export type DriveError =
  | 'not_configured'
  | 'offline'
  | 'needs_consent'
  | 'auth_cancelled'
  | 'auth_failed'
  | 'unauthorized'
  | 'timeout'
  | 'network'
  | 'quota'
  | 'rate_limited'
  | 'server'
  | 'not_found'
  | 'checksum_mismatch'
  | 'needs_password'
  | 'export_failed'
  | 'verify_failed'
  | 'busy';

export interface DriveBackupFile {
  id: string;
  name: string;
  bytes: number | null;
  /** When the backup was made (epoch ms; from our own file properties, else Drive's createdTime). */
  createdAt: number;
  /** SHA-256 (hex) of the uploaded encrypted bytes, checked again after download. */
  sha256: string | null;
}

export interface DriveUpload {
  name: string;
  bytes: Uint8Array;
  sha256: string;
  createdAt: number;
}

/** Google sign-in for Drive access. Tokens live in memory only (about 1 hour). */
export interface DriveAuth {
  isConfigured(): boolean;
  /** A token that is still valid is cached. */
  hasToken(): boolean;
  /** Loads Google's script ahead of a tap, so the sign-in window opens straight from the tap. */
  prepare(): Promise<void>;
  /**
   * `interactive: true` only from a tap: may open Google's window. Must be the FIRST call in the tap's
   * handler (no await before it), or iOS/Android block the window.
   */
  getToken(interactive: boolean): Promise<Result<string, DriveError>>;
  /** Forget the token here and revoke it at Google. */
  revoke(): Promise<void>;
  /** Drop a token the API rejected (401). */
  invalidate(): void;
}

/** Drive REST v3 calls the backup needs. */
export interface DriveApi {
  /** The visible "PT Coach Backups" folder, created on first use. */
  ensureFolder(token: string): Promise<Result<string, DriveError>>;
  upload(token: string, folderId: string, file: DriveUpload): Promise<Result<DriveBackupFile, DriveError>>;
  list(token: string, folderId: string): Promise<Result<DriveBackupFile[], DriveError>>;
  download(token: string, fileId: string, expectedBytes: number | null): Promise<Result<Uint8Array, DriveError>>;
  remove(token: string, fileId: string): Promise<Result<void, DriveError>>;
}

export const DRIVE_FOLDER_NAME = 'PT Coach Backups';
/** Non-sensitive scope: the app sees only files it created itself, nothing else in the trainer's Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
/** Device-local meta keys (the `backup.` prefix keeps them out of backups). */
export const DRIVE_PASSWORD_KEY = 'backup.drivePassword';
export const DRIVE_CLIENT_ID_KEY = 'backup.googleClientId';
