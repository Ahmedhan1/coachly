import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, MIGRATIONS, type Migration } from '@/data/schema';
import { memoryBackupMetaStore } from '@/data/backupMeta';
import { exportArchive } from './exporter';
import { importArchive } from './importer';
import { LocalBackupService } from './localBackupService';
import { dumpDatabase, rewriteZip, seedDatabase, ShrinkingDownscaler, testDbFactory } from './testFixtures';

const NOW = new Date('2026-11-16T10:00:00Z');
const APP = '0.1.0';

async function exported(db: Parameters<typeof exportArchive>[0], extra: Partial<Parameters<typeof exportArchive>[1]> = {}) {
  const r = await exportArchive(db, { appVersion: APP, now: NOW, ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('backup export → import', () => {
  it('round trip restores identical rows (soft-deleted + deletions log + meta) and byte-equal blobs', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const archive = await exported(source);
    expect(archive.manifest.counts).toMatchObject({ clients: 2, deletions: 1, images: 3, progress: 1, settings: 1 });
    expect(archive.manifest.imageFiles).toBe(3);
    expect(archive.manifest.schemaVersion).toBe(LATEST_VERSION);

    const target = f.open();
    await seedDatabase(target, { start: 5, images: 1 }); // different existing data, must be replaced
    await target.meta.put({ key: 'auth.token', value: 'device-b-token' });
    const before = await dumpDatabase(source);

    const r = await importArchive(target, archive.blob);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ migratedFrom: null, imageVariant: 'full', counts: { clients: 2, images: 3 } });
    expect(await dumpDatabase(target)).toEqual(before);
    // this device's account stays; the source device's token never travelled
    expect((await target.meta.get('auth.token'))?.value).toBe('device-b-token');
    const zipText = new TextDecoder().decode(new Uint8Array(await archive.blob.arrayBuffer()));
    expect(zipText.includes('device-a-token')).toBe(false);
  });

  it('refuses a corrupted file checksum and keeps current data', async () => {
    const f = testDbFactory();
    const source = f.open();
    const { imageIds } = await seedDatabase(source);
    const archive = await exported(source);
    const target = f.open();
    await seedDatabase(target, { start: 99, images: 1 });
    const before = await dumpDatabase(target);
    const bad = await rewriteZip(archive.blob, (files) => {
      const path = `images/${imageIds[1]}.jpg`;
      const bytes = files[path]!.slice();
      bytes[10] = (bytes[10]! + 1) & 0xff;
      files[path] = bytes;
    }, false);
    expect(await importArchive(target, bad)).toEqual({ ok: false, error: 'checksum_mismatch' });
    expect(await dumpDatabase(target)).toEqual(before);
  });

  it('refuses a newer schema version', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const archive = await exported(source);
    const newer = await rewriteZip(archive.blob, (files) => {
      const m = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as { schemaVersion: number };
      m.schemaVersion = 99;
      files['manifest.json'] = strToU8(JSON.stringify(m));
    }, false);
    const target = f.open();
    expect(await importArchive(target, newer)).toEqual({ ok: false, error: 'newer_schema' });
  });

  it('a failure inside the restore transaction leaves the original data intact', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const archive = await exported(source);
    // Valid checksums, but two clients share an id → the bulk add fails half-way through the transaction.
    const broken = await rewriteZip(archive.blob, (files) => {
      const rows = JSON.parse(new TextDecoder().decode(files['data/clients.json'])) as { id: string }[];
      rows[1] = { ...rows[1]!, id: rows[0]!.id };
      files['data/clients.json'] = strToU8(JSON.stringify(rows));
    }, true);
    const target = f.open();
    await seedDatabase(target, { start: 42, images: 2 });
    const before = await dumpDatabase(target);
    expect(await importArchive(target, broken)).toEqual({ ok: false, error: 'write_failed' });
    expect(await dumpDatabase(target)).toEqual(before);
  });

  it('refuses non-backups, unexpected files and missing files', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const archive = await exported(source);
    const target = f.open();
    expect(await importArchive(target, new Blob(['hello']))).toEqual({ ok: false, error: 'not_a_backup' });
    const extra = await rewriteZip(archive.blob, (files) => {
      files['evil.sh'] = strToU8('rm -rf /');
    }, false);
    expect(await importArchive(target, extra)).toEqual({ ok: false, error: 'unexpected_file' });
    const missing = await rewriteZip(archive.blob, (files) => {
      delete files['data/sessions.json'];
    }, false);
    expect(await importArchive(target, missing)).toEqual({ ok: false, error: 'missing_file' });
  });

  it('restores a backup written at schema version 1 into the current schema', async () => {
    const f = testDbFactory();
    const source = f.open(MIGRATIONS.filter((m) => m.version === 1));
    await seedDatabase(source);
    const archive = await exported(source);
    expect(archive.manifest.schemaVersion).toBe(1);
    const target = f.open();
    const r = await importArchive(target, archive.blob, { openTemp: f.openTemp });
    expect(r.ok && r.value.migratedFrom).toBe(1);
    expect(r.ok && r.value.schemaVersion).toBe(LATEST_VERSION);
    expect(await target.clients.count()).toBe(2);
    expect(await target.images.count()).toBe(3);
  });

  it('migrates an older-schema backup through the migration path', async () => {
    const f = testDbFactory();
    const source = f.open(MIGRATIONS);
    await seedDatabase(source);
    const archive = await exported(source);
    const v2: Migration = {
      version: LATEST_VERSION + 1,
      stores: { clients: 'id, name, endDate, updatedAt, deletedAt, archived' },
      upgrade: async (tx) => {
        await tx.table('clients').toCollection().modify((c: { archived?: number }) => {
          c.archived = 0;
        });
      },
    };
    const migrations = [...MIGRATIONS, v2];
    const target = f.open(migrations);
    const r = await importArchive(target, archive.blob, { migrations, openTemp: f.openTemp });
    expect(r.ok && r.value.migratedFrom).toBe(LATEST_VERSION);
    expect(r.ok && r.value.schemaVersion).toBe(LATEST_VERSION + 1);
    expect(await target.table('clients').where('archived').equals(0).count()).toBe(2);
    const blobs = await target.images.toArray();
    expect(blobs).toHaveLength(3);
  });

  it('cancels quietly', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const controller = new AbortController();
    controller.abort();
    expect(await exportArchive(source, { appVersion: APP, now: NOW, signal: controller.signal })).toEqual({ ok: false, error: 'cancelled' });
  });
});

describe('image variants (cloud copy)', () => {
  it('thumbnail variant is much smaller; none carries no photos', async () => {
    const f = testDbFactory();
    const db = f.open();
    await seedDatabase(db, { images: 20, imageBytes: 200_000 });
    const full = await exported(db);
    const thumbs = await exported(db, { imageVariant: 'thumbnail', downscaler: new ShrinkingDownscaler() });
    const none = await exported(db, { imageVariant: 'none' });
    expect(full.blob.size).toBeGreaterThan(4_000_000);
    expect(thumbs.blob.size).toBeLessThan(full.blob.size / 8);
    expect(none.blob.size).toBeLessThan(20_000);
    expect(thumbs.manifest).toMatchObject({ imageVariant: 'thumbnail', imageFiles: 20 });
    expect(none.manifest).toMatchObject({ imageVariant: 'none', imageFiles: 0 });
    console.info(`[sizes] 20 photos x 200 KB: full=${full.blob.size} thumbnail=${thumbs.blob.size} none=${none.blob.size}`);

    const target = f.open();
    const r = await importArchive(target, thumbs.blob);
    expect(r.ok && r.value.imageVariant).toBe('thumbnail');
    const img = (await target.images.toArray())[0]!;
    expect(img.width).toBe(400);
    expect(img.bytes).toBe(img.blob.size);
  });

  it('exports and restores 500 progress photos', async () => {
    const f = testDbFactory();
    const db = f.open();
    await seedDatabase(db, { images: 500, imageBytes: 20_000 });
    const phases = new Set<string>();
    const archive = await exported(db, { onProgress: (p) => phases.add(p.phase) });
    expect(archive.manifest.imageFiles).toBe(500);
    expect([...phases]).toEqual(['tables', 'images', 'finalize']);
    const target = f.open();
    const r = await importArchive(target, archive.blob);
    expect(r.ok && r.value.counts.images).toBe(500);
  }, 30_000);
});

describe('LocalBackupService (encrypted file)', () => {
  it('encrypted round trip; wrong or missing password refused', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const meta = memoryBackupMetaStore();
    const service = new LocalBackupService({ db: source, meta, appVersion: APP, now: () => NOW, iterations: 100_000 });
    expect(await service.exportFile({ password: 'short' })).toEqual({ ok: false, error: 'weak_password' });
    const file = await service.exportFile({ password: 'كلمة-سر-طويلة' });
    if (!file.ok) throw new Error(file.error);
    expect(file.value).toMatchObject({ encrypted: true, mimeType: 'application/octet-stream' });
    expect(file.value.fileName).toMatch(/^pt-coach-backup-\d{4}-\d{2}-\d{2}-\d{4}\.ptbackup$/);
    expect(await service.detectFile(file.value.blob)).toBe('encrypted');

    const target = f.open();
    const restore = new LocalBackupService({ db: target, meta: memoryBackupMetaStore(), appVersion: APP, now: () => NOW });
    expect(await restore.importFile(file.value.blob)).toEqual({ ok: false, error: 'password_required' });
    expect(await restore.importFile(file.value.blob, { password: 'wrong-password' })).toEqual({ ok: false, error: 'wrong_password' });
    const r = await restore.importFile(file.value.blob, { password: 'كلمة-سر-طويلة' });
    expect(r.ok).toBe(true);
    expect(await dumpDatabase(target)).toEqual(await dumpDatabase(source));

    await service.recordSaved(123);
    expect((await service.status()).lastLocalAt).toBe(123);
  }, 30_000);

  it('plain zip export is detected and imported', async () => {
    const f = testDbFactory();
    const db = f.open();
    await seedDatabase(db);
    const service = new LocalBackupService({ db, meta: memoryBackupMetaStore(), appVersion: APP, now: () => NOW });
    const file = await service.exportFile();
    if (!file.ok) throw new Error(file.error);
    expect(file.value).toMatchObject({ encrypted: false, mimeType: 'application/zip' });
    expect(await service.detectFile(file.value.blob)).toBe('zip');
    expect(await service.detectFile(new Blob(['x']))).toBe('unknown');
    expect(await service.importFile(new Blob(['x']))).toEqual({ ok: false, error: 'not_a_backup' });
  });

  it('verifyFile checks an encrypted file end to end without writing, and catches a corrupted byte', async () => {
    const f = testDbFactory();
    const db = f.open();
    await seedDatabase(db);
    const service = new LocalBackupService({ db, meta: memoryBackupMetaStore(), appVersion: APP, now: () => NOW, iterations: 100_000 });
    const file = await service.exportFile({ password: 'verify-pass-1' });
    if (!file.ok) throw new Error(file.error);
    const before = await dumpDatabase(db);
    const v = await service.verifyFile(file.value.blob, 'verify-pass-1');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.counts).toMatchObject({ clients: 2, images: 3 });
    expect(await dumpDatabase(db)).toEqual(before);
    expect(await service.verifyFile(file.value.blob, 'other-pass-1')).toEqual({ ok: false, error: 'wrong_password' });
    // Flip one byte inside the ciphertext: AES-GCM refuses it.
    const bytes = new Uint8Array(await file.value.blob.arrayBuffer());
    bytes[bytes.length - 40] = (bytes[bytes.length - 40] ?? 0) ^ 0xff;
    const bad = await service.verifyFile(new Blob([bytes as BlobPart]), 'verify-pass-1');
    expect(bad.ok).toBe(false);
    // A plain zip whose image changed after export fails the checksum.
    const plain = await service.exportFile();
    if (!plain.ok) throw new Error(plain.error);
    const tampered = await rewriteZip(plain.value.blob, (files) => {
      const key = Object.keys(files).find((k) => k.startsWith('images/'))!;
      files[key] = strToU8('changed');
    }, false);
    expect(await service.verifyFile(tampered, null)).toEqual({ ok: false, error: 'checksum_mismatch' });
  }, 30_000);
});
