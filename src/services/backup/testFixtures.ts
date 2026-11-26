import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { AppDatabase } from '@/data/db';
import { createRepositories, type Repositories } from '@/data/repositories';
import { MIGRATIONS, type Migration } from '@/data/schema';
import type { TempDatabaseFactory } from '@/data/backupIO';
import type { DownscaledImage, ImageDownscaler } from '@/services/storage/types';
import { fitWithin } from '@/services/storage/targetSize';
import { sha256Hex } from './zipIO';

/** Test-only helpers for backup tests (fake-indexeddb databases sharing one factory, fixture data, zip surgery). */

export function testDbFactory() {
  const options = { indexedDB: new IDBFactory(), IDBKeyRange };
  let n = 0;
  const open = (migrations: readonly Migration[] = MIGRATIONS, name = `db${++n}`) => new AppDatabase(name, options, migrations);
  const openTemp: TempDatabaseFactory = (name, migrations) => new AppDatabase(name, options, migrations);
  return { open, openTemp };
}

export function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

const clientInput = (name: string) => ({
  name,
  phone: '0100',
  gender: 'female' as const,
  birthDate: '1995-03-04',
  goal: 'fat_loss' as const,
  goalNote: 'تنشيف',
  injuries: ['ركبة'],
  measurements: { weightKg: 72.5, heightCm: 165 },
  package: null,
  startDate: null,
  endDate: null,
  remainingSessions: 4,
  notes: 'ملاحظة',
  photoId: null,
});

/** Fills a database with every kind of row: live, soft-deleted, deletions log, settings, meta, images. */
export async function seedDatabase(db: AppDatabase, options: { images?: number; imageBytes?: number; start?: number } = {}) {
  let now = options.start ?? 1_763_280_000_000;
  let id = 0;
  const repos: Repositories = createRepositories(
    db,
    () => (now += 1000),
    () => `id${++id}`,
  );
  await repos.settings.update({ name: 'كابتن سارة', primaryColor: '#112233' });
  const imageIds: string[] = [];
  for (let i = 0; i < (options.images ?? 3); i++) {
    const meta = await repos.images.save({
      blob: new Blob([seededBytes(options.imageBytes ?? 2048, i + 1) as BlobPart], { type: 'image/jpeg' }),
      width: 1200,
      height: 900,
    });
    imageIds.push(meta.id);
  }
  const a = await repos.clients.create({ ...clientInput('سارة أحمد'), photoId: (imageIds[0] ?? null) as never });
  const b = await repos.clients.create(clientInput('منى'));
  await repos.clients.softDelete(b.id);
  await repos.progress.create({
    clientId: a.id,
    date: '2026-11-01',
    measurements: { weightKg: 71 },
    photoIds: imageIds.slice(1, 13) as never,
    notes: '',
    source: 'trainer',
  });
  await db.meta.put({ key: 'firstRunDone', value: true });
  await db.meta.put({ key: 'auth.token', value: 'device-a-token' });
  return { repos, imageIds, clientIds: [a.id, b.id] };
}

/** Every table's rows sorted by primary key, blobs replaced by their bytes, device-local meta dropped. */
export async function dumpDatabase(db: AppDatabase): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    let rows = (await table.toArray()) as Record<string, unknown>[];
    if (table.name === 'meta') rows = rows.filter((r) => !String(r.key).startsWith('auth.') && !String(r.key).startsWith('backup.'));
    const withBytes = await Promise.all(
      rows.map(async (r) => (r.blob instanceof Blob ? { ...r, blob: Array.from(new Uint8Array(await r.blob.arrayBuffer())), blobType: r.blob.type } : r)),
    );
    const key = table.schema.primKey.keyPath as string;
    out[table.name] = withBytes.sort((x, y) => String(x[key]).localeCompare(String(y[key])));
  }
  return out;
}

/** Rewrites one file inside a backup zip; `fixManifest` recomputes its checksum so only content changes. */
export async function rewriteZip(
  zip: Blob,
  edit: (files: Record<string, Uint8Array>) => void,
  fixManifest: boolean,
): Promise<Blob> {
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  edit(files);
  if (fixManifest) {
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as { files: { path: string; sha256: string; bytes: number }[] };
    for (const f of manifest.files) {
      const bytes = files[f.path];
      if (bytes) {
        f.sha256 = await sha256Hex(bytes);
        f.bytes = bytes.length;
      }
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
  }
  return new Blob([zipSync(files as Zippable) as BlobPart], { type: 'application/zip' });
}

/** Downscaler whose output size scales with pixel area, like a real JPEG re-encode. */
export class ShrinkingDownscaler implements ImageDownscaler {
  async downscale(input: Blob, maxSide = 1200): Promise<DownscaledImage> {
    const size = fitWithin(1200, 900, maxSide);
    const ratio = (size.width * size.height) / (1200 * 900);
    const bytes = new Uint8Array(await input.arrayBuffer()).slice(0, Math.max(1, Math.round(input.size * ratio)));
    return { blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), ...size };
  }
}
