import { z } from 'zod';
import { err, ok, type Result } from '../nutrition/result';

/**
 * Backup archive layout (one .zip):
 *   manifest.json            this manifest (not listed in `files`)
 *   data/<table>.json        every row of one table, soft-deleted rows included (images table: metadata only)
 *   images/<id>.<ext>        one image Blob, stored without re-compression
 */
export const BACKUP_FORMAT = 'pt-coach-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_PATH = 'manifest.json';

/** Which photo bytes the archive carries. Cloud copies may carry thumbnails or no photos (LIMITS.md policy). */
export type ImageVariant = 'full' | 'thumbnail' | 'none';
export const IMAGE_VARIANTS: readonly ImageVariant[] = ['full', 'thumbnail', 'none'];

const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const DATA_PATH = /^data\/[A-Za-z][A-Za-z0-9_]{0,63}\.json$/;
const IMAGE_PATH = /^images\/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isAllowedArchivePath(path: string): boolean {
  return path === MANIFEST_PATH || DATA_PATH.test(path) || IMAGE_PATH.test(path);
}

export function tableFilePath(table: string): string {
  if (!TABLE_NAME.test(table)) throw new RangeError(`invalid table name: ${table}`);
  return `data/${table}.json`;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Archive path of an image Blob, or null when id or mime cannot be stored safely. */
export function imageFilePath(id: string, mime: string): string | null {
  const ext = EXTENSIONS[mime];
  const path = ext ? `images/${id}.${ext}` : null;
  return path && IMAGE_PATH.test(path) ? path : null;
}

export function mimeForImagePath(path: string): string | null {
  const ext = path.split('.').pop() ?? '';
  return IMAGE_PATH.test(path) ? (MIME_BY_EXT[ext] ?? null) : null;
}

const fileEntrySchema = z.object({
  path: z.string().refine((p) => p !== MANIFEST_PATH && isAllowedArchivePath(p), 'path not allowed'),
  sha256: z.string().regex(SHA256_HEX),
  bytes: z.number().int().nonnegative(),
});

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  appVersion: z.string().min(1).max(40),
  schemaVersion: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  imageVariant: z.enum(['full', 'thumbnail', 'none']),
  /** Row count per table (images = metadata rows). */
  counts: z.record(z.string().regex(TABLE_NAME), z.number().int().nonnegative()),
  imageFiles: z.number().int().nonnegative(),
  files: z.array(fileEntrySchema).max(100_000),
});

export type BackupManifest = z.infer<typeof manifestSchema>;
export type ManifestFile = z.infer<typeof fileEntrySchema>;

export interface ManifestInput {
  appVersion: string;
  schemaVersion: number;
  createdAt: number;
  imageVariant: ImageVariant;
  counts: Record<string, number>;
  files: readonly ManifestFile[];
}

export function buildManifest(input: ManifestInput): BackupManifest {
  const files = [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    imageVariant: input.imageVariant,
    counts: { ...input.counts },
    imageFiles: files.filter((f) => f.path.startsWith('images/')).length,
    files,
  };
}

export type ManifestError = 'not_a_backup' | 'unsupported_format' | 'malformed';

/** Parses manifest.json text. Refuses unknown formats and newer archive-format versions. */
export function parseManifest(text: string): Result<BackupManifest, ManifestError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err('malformed');
  }
  if (typeof json !== 'object' || json === null || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return err('not_a_backup');
  }
  const version = (json as { formatVersion?: unknown }).formatVersion;
  if (typeof version === 'number' && version > BACKUP_FORMAT_VERSION) return err('unsupported_format');
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) return err('malformed');
  const m = parsed.data;
  const paths = new Set(m.files.map((f) => f.path));
  if (paths.size !== m.files.length) return err('malformed');
  if (m.files.filter((f) => f.path.startsWith('images/')).length !== m.imageFiles) return err('malformed');
  for (const table of Object.keys(m.counts)) if (!paths.has(tableFilePath(table))) return err('malformed');
  return ok(m);
}

export type FileCheckError = 'checksum_mismatch' | 'missing_file' | 'unexpected_file';
export type FileCheckResult = { ok: true } | { ok: false; error: FileCheckError; path: string };

/** Compares what the archive actually contained with what the manifest promised. */
export function verifyArchiveFiles(
  manifest: BackupManifest,
  actual: ReadonlyMap<string, { sha256: string; bytes: number }>,
): FileCheckResult {
  for (const f of manifest.files) {
    const got = actual.get(f.path);
    if (!got) return { ok: false, error: 'missing_file', path: f.path };
    if (got.sha256 !== f.sha256 || got.bytes !== f.bytes) return { ok: false, error: 'checksum_mismatch', path: f.path };
  }
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const path of actual.keys()) {
    if (path !== MANIFEST_PATH && !listed.has(path)) return { ok: false, error: 'unexpected_file', path };
  }
  return { ok: true };
}
