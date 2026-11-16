import {
  buildManifest,
  imageFilePath,
  MANIFEST_PATH,
  tableFilePath,
  THUMBNAIL_MAX_SIDE,
  type ImageVariant,
  type ManifestFile,
} from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { AppDatabase, ImageRecord } from '@/data/db';
import { readImage, snapshotTables } from '@/data/backupIO';
import type { ImageDownscaler } from '@/services/storage/types';
import type { ExportedArchive, ExportError, ProgressListener } from './types';
import { sha256Hex, ZipBlobWriter } from './zipIO';

export interface ExportArchiveOptions {
  appVersion: string;
  now: Date;
  imageVariant?: ImageVariant;
  /** Required for the thumbnail variant. */
  downscaler?: ImageDownscaler;
  thumbnailMaxSide?: number;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
}

const encoder = new TextEncoder();

type ImageMetaRow = Omit<ImageRecord, 'blob'>;

async function imageBytes(
  record: ImageRecord,
  variant: ImageVariant,
  options: ExportArchiveOptions,
): Promise<{ meta: ImageMetaRow; bytes: Uint8Array } | null> {
  const { blob, ...meta } = record;
  if (variant === 'full') return { meta, bytes: new Uint8Array(await blob.arrayBuffer()) };
  if (!options.downscaler) return null;
  try {
    const small = await options.downscaler.downscale(blob, options.thumbnailMaxSide ?? THUMBNAIL_MAX_SIDE);
    const mime = small.blob.type || 'image/jpeg';
    const bytes = new Uint8Array(await small.blob.arrayBuffer());
    return { meta: { ...meta, mime: mime as ImageMetaRow['mime'], width: small.width, height: small.height, bytes: bytes.length }, bytes };
  } catch {
    return null;
  }
}

/**
 * Exports the whole database into one zip: every table's rows (soft-deleted rows and the deletions log
 * included), image metadata, image files and a manifest with SHA-256 per file. Images are read one at a
 * time. Never throws.
 */
export async function exportArchive(db: AppDatabase, options: ExportArchiveOptions): Promise<Result<ExportedArchive, ExportError>> {
  const variant = options.imageVariant ?? 'full';
  const createdAt = options.now.getTime();
  const writer = new ZipBlobWriter(createdAt);
  const files: ManifestFile[] = [];
  const counts: Record<string, number> = {};
  let skippedImages = 0;
  try {
    await db.open();
    const snapshot = await snapshotTables(db);
    const tables = Object.keys(snapshot.tables);
    const imageIds = variant === 'none' ? [] : snapshot.imageIds;
    const total = tables.length + imageIds.length + 1;
    let done = 0;
    const progress = (phase: 'tables' | 'images' | 'finalize') => options.onProgress?.({ phase, done, total });

    const addFile = async (path: string, bytes: Uint8Array, compress: boolean) => {
      files.push({ path, bytes: bytes.length, sha256: await sha256Hex(bytes) });
      if (compress) writer.addDeflated(path, bytes);
      else writer.addStored(path, bytes);
    };

    for (const table of tables) {
      if (options.signal?.aborted) return err('cancelled');
      const rows = snapshot.tables[table] ?? [];
      counts[table] = rows.length;
      await addFile(tableFilePath(table), encoder.encode(JSON.stringify(rows)), true);
      done += 1;
      progress('tables');
    }
    snapshot.tables = {};

    const imageRows: ImageMetaRow[] = [];
    for (const id of imageIds) {
      if (options.signal?.aborted) return err('cancelled');
      const record = await readImage(db, id);
      if (record) {
        const item = await imageBytes(record, variant, options);
        if (!item) {
          if (variant === 'full') return err('read_failed');
          skippedImages += 1;
        } else {
          const path = imageFilePath(item.meta.id, item.meta.mime);
          if (!path) return err('invalid_image_id');
          await addFile(path, item.bytes, false);
          imageRows.push(item.meta);
        }
      }
      done += 1;
      progress('images');
    }
    counts.images = imageRows.length;
    await addFile(tableFilePath('images'), encoder.encode(JSON.stringify(imageRows)), true);

    const manifest = buildManifest({
      appVersion: options.appVersion,
      schemaVersion: db.verno,
      createdAt,
      imageVariant: variant,
      counts,
      files,
    });
    writer.addDeflated(MANIFEST_PATH, encoder.encode(JSON.stringify(manifest)));
    const blob = writer.finish();
    done = total;
    progress('finalize');
    return ok({ blob, manifest, skippedImages });
  } catch {
    return err('read_failed');
  }
}
