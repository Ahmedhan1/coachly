import {
  archivedImageIds,
  imageFilePath,
  PLACEHOLDER_MAX_SIDE,
  selectPhotosToArchive,
  type BackupManifest,
  type PhotoArchiveEntry,
} from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { AppDatabase, ImageRecord } from '@/data/db';
import { commitPhotoArchive, readArchiveRegistry, readImage, readImageOwners, restoreArchivedImages, type PlaceholderSwap } from '@/data/backupIO';
import type { ImageDownscaler } from '@/services/storage/types';
import { sealChunked } from './chunkedEnvelope';
import { exportArchive } from './exporter';
import { readVerifiedArchive } from './importer';
import { ENCRYPTED_BACKUP_MIME, ZIP_MIME } from './localBackupService';
import { MIN_BACKUP_PASSWORD_LENGTH, type BackupFile, type ExportError, type ImportError, type ImportOptions, type ProgressListener } from './types';

/**
 * «أرشفة الصور القديمة». Never-lose-data order, enforced by the types:
 *   plan → createFile → (UI saves it outside the app) → verifySavedFile(the file picked back from Files)
 *   → commit(verified) swaps the originals for placeholders.
 * `commit` only accepts what `verifySavedFile` returned, so nothing is removed before the saved file was read
 * back and every photo's checksum matched. Restoring the file (`restore`) puts the full photos back.
 */

export interface ArchivePlan {
  ids: string[];
  bytes: number;
}

export interface PhotoArchiveFile {
  archiveId: string;
  file: BackupFile;
  /** The photos the file really holds (a photo deleted meanwhile is simply absent). */
  imageIds: string[];
}

declare const verifiedBrand: unique symbol;
/** Proof that the saved file was read back and matched. Only `verifySavedFile` makes one. */
export interface VerifiedPhotoArchive {
  readonly [verifiedBrand]: true;
  archiveId: string;
  fileName: string;
  createdAt: number;
  /** id → archived original size and type. */
  originals: ReadonlyMap<string, { bytes: number; mime: string }>;
}

export type VerifyArchiveError = ImportError | 'different_file';
export type CommitError = 'nothing_archived' | 'write_failed';

export interface PhotoArchiveDeps {
  db: AppDatabase;
  downscaler: ImageDownscaler;
  appVersion: string;
  now: () => Date;
  /** Decrypts a picked file to its zip (LocalBackupService.openFile). */
  openFile: (file: Blob, options: ImportOptions) => Promise<Result<Blob, ImportError>>;
  newId?: () => string;
  iterations?: number;
  chunkBytes?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** e.g. `pt-coach-photos-2026-11-17-0930.ptbackup` (local time). */
export function photoArchiveFileName(now: Date, encrypted: boolean): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `pt-coach-photos-${stamp}.${encrypted ? 'ptbackup' : 'zip'}`;
}

export class PhotoArchiveService {
  constructor(private readonly deps: PhotoArchiveDeps) {}

  private newId(): string {
    return this.deps.newId?.() ?? crypto.randomUUID().replace(/-/g, '');
  }

  registry(): Promise<PhotoArchiveEntry[]> {
    return readArchiveRegistry(this.deps.db).catch(() => []);
  }

  /** Old client/progress photos that would move into the file. */
  async plan(months: number): Promise<ArchivePlan> {
    const [owners, registry] = await Promise.all([readImageOwners(this.deps.db), readArchiveRegistry(this.deps.db)]);
    return selectPhotosToArchive(owners.images, owners.owners, archivedImageIds(registry), this.deps.now(), months);
  }

  /** Builds the archive file (full photos + their metadata), encrypted when a password is given. */
  async createFile(
    ids: readonly string[],
    password: string | null,
    options: { onProgress?: ProgressListener; signal?: AbortSignal } = {},
  ): Promise<Result<PhotoArchiveFile, ExportError>> {
    if (password !== null && password.length < MIN_BACKUP_PASSWORD_LENGTH) return err('weak_password');
    const now = this.deps.now();
    const archiveId = this.newId();
    const archive = await exportArchive(this.deps.db, {
      appVersion: this.deps.appVersion,
      now,
      photoArchive: { archiveId, imageIds: ids },
      onProgress: options.onProgress,
      signal: options.signal,
    });
    if (!archive.ok) return archive;
    const imageIds = archive.value.manifest.files.filter((f) => f.path.startsWith('images/')).map((f) => f.path.slice(7, f.path.lastIndexOf('.')));
    const base = { manifest: archive.value.manifest, encrypted: password !== null };
    if (password === null) {
      return ok({ archiveId, imageIds, file: { ...base, blob: archive.value.blob, fileName: photoArchiveFileName(now, false), mimeType: ZIP_MIME } });
    }
    try {
      const blob = await sealChunked(archive.value.blob, password, {
        iterations: this.deps.iterations,
        chunkBytes: this.deps.chunkBytes,
        signal: options.signal,
        onProgress: (done, total) => options.onProgress?.({ phase: 'encrypt', done, total }),
      });
      return ok({ archiveId, imageIds, file: { ...base, blob, fileName: photoArchiveFileName(now, true), mimeType: ENCRYPTED_BACKUP_MIME } });
    } catch {
      return err(options.signal?.aborted ? 'cancelled' : 'encrypt_failed');
    }
  }

  /**
   * Reads the file the trainer picked back (from Files / Downloads), decrypts it, checks every file's checksum
   * and that it is exactly the archive just made. Writes nothing.
   */
  async verifySavedFile(
    picked: Blob,
    password: string | null,
    expected: PhotoArchiveFile,
    onProgress?: ProgressListener,
  ): Promise<Result<VerifiedPhotoArchive, VerifyArchiveError>> {
    const zip = await this.deps.openFile(picked, { password, onProgress });
    if (!zip.ok) return zip;
    const read = await readVerifiedArchive(this.deps.db, zip.value, { onProgress });
    if (!read.ok) return read;
    const { manifest } = read.value;
    if (manifest.kind !== 'photos' || manifest.archiveId !== expected.archiveId || !sameFiles(manifest, expected.file.manifest)) {
      return err('different_file');
    }
    const originals = new Map<string, { bytes: number; mime: string }>();
    for (const row of read.value.tables.images ?? []) {
      const r = row as Partial<ImageRecord>;
      if (typeof r.id === 'string' && typeof r.mime === 'string' && r.blob instanceof Blob) originals.set(r.id, { bytes: r.blob.size, mime: r.mime });
    }
    return ok({ archiveId: expected.archiveId, fileName: expected.file.fileName, createdAt: manifest.createdAt, originals } as unknown as VerifiedPhotoArchive);
  }

  /**
   * Swaps the verified photos for small placeholders and records which file holds them. A photo whose
   * placeholder cannot be made, or would not be smaller, keeps its full bytes.
   */
  async commit(verified: VerifiedPhotoArchive, onProgress?: (done: number, total: number) => void): Promise<Result<{ archived: number; freedBytes: number }, CommitError>> {
    const swaps: PlaceholderSwap[] = [];
    let done = 0;
    const total = verified.originals.size;
    for (const [id, original] of verified.originals) {
      try {
        const current = await readImage(this.deps.db, id);
        if (current && current.bytes === original.bytes && current.mime === original.mime && imageFilePath(id, current.mime)) {
          const small = await this.deps.downscaler.downscale(current.blob, PLACEHOLDER_MAX_SIDE);
          const okType = small.blob.type === 'image/jpeg' || small.blob.type === 'image/png' || small.blob.type === 'image/webp';
          if (okType && small.blob.size > 0 && small.blob.size < current.bytes) {
            swaps.push({ id, expectBytes: original.bytes, expectMime: original.mime, placeholder: small });
          }
        }
      } catch {
        // keep this photo as it is
      }
      done += 1;
      onProgress?.(done, total);
    }
    if (swaps.length === 0) return err('nothing_archived');
    try {
      const now = this.deps.now().getTime();
      const r = await commitPhotoArchive(
        this.deps.db,
        { id: verified.archiveId, fileName: verified.fileName, createdAt: verified.createdAt, savedAt: now, restoredAt: null },
        swaps,
      );
      return r.ids.length === 0 ? err('nothing_archived') : ok({ archived: r.ids.length, freedBytes: r.freedBytes });
    } catch {
      return err('write_failed');
    }
  }

  /** Puts full photos from an archive file back. Refuses full backups (those go through the normal restore). */
  async restore(file: Blob, options: ImportOptions = {}): Promise<Result<{ restored: number; skipped: number }, ImportError>> {
    const zip = await this.deps.openFile(file, options);
    if (!zip.ok) return zip;
    const read = await readVerifiedArchive(this.deps.db, zip.value, { onProgress: options.onProgress, signal: options.signal });
    if (!read.ok) return read;
    if (read.value.manifest.kind !== 'photos') return err('not_a_photo_archive');
    try {
      const rows = (read.value.tables.images ?? []) as ImageRecord[];
      return ok(await restoreArchivedImages(this.deps.db, rows, this.deps.now().getTime()));
    } catch {
      return err('write_failed');
    }
  }
}

function sameFiles(a: BackupManifest, b: BackupManifest): boolean {
  if (a.files.length !== b.files.length) return false;
  return a.files.every((f, i) => {
    const g = b.files[i];
    return g !== undefined && g.path === f.path && g.sha256 === f.sha256 && g.bytes === f.bytes;
  });
}
