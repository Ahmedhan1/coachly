import { describe, expect, it } from 'vitest';
import { ARCHIVE_REGISTRY_KEY, parseArchiveRegistry } from '@/domain/backup';
import { memoryBackupMetaStore } from '@/data/backupMeta';
import { LocalBackupService } from './localBackupService';
import { PhotoArchiveService } from './photoArchive';
import { seedDatabase, seededBytes, ShrinkingDownscaler, testDbFactory } from './testFixtures';

const DAY = 86_400_000;
const ITER = 100_000;

async function setup() {
  const f = testDbFactory();
  const db = f.open();
  // seed clock starts 2025-11-16: progress photos are a year old by "now".
  const seeded = await seedDatabase(db, { images: 5, imageBytes: 200 * 1024 });
  const now = () => new Date(1_763_280_000_000 + 365 * DAY);
  const local = new LocalBackupService({ db, meta: memoryBackupMetaStore(), appVersion: '1', now, iterations: ITER, chunkBytes: 64 * 1024 });
  let n = 0;
  const archive = new PhotoArchiveService({
    db,
    downscaler: new ShrinkingDownscaler(),
    appVersion: '1',
    now,
    openFile: (file, o) => local.openFile(file, o),
    newId: () => `arc${++n}`,
    iterations: ITER,
    chunkBytes: 64 * 1024,
  });
  return { f, db, seeded, local, archive };
}

async function bytesOf(db: Awaited<ReturnType<typeof setup>>['db'], id: string) {
  return new Uint8Array(await (await db.images.get(id))!.blob.arrayBuffer());
}

describe('PhotoArchiveService', () => {
  it('plan → file → pick back + verify → placeholders → restore brings the exact photos back', async () => {
    const { db, seeded, archive } = await setup();
    const plan = await archive.plan(6);
    // all 5 images are referenced by the client (1) and the progress entry (4): all client photos.
    expect(plan.ids.sort()).toEqual([...seeded.imageIds].sort());
    const originals = new Map(await Promise.all(plan.ids.map(async (id) => [id, await bytesOf(db, id)] as const)));

    const made = await archive.createFile(plan.ids, 'long-password');
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.file.fileName).toMatch(/^pt-coach-photos-\d{4}-\d{2}-\d{2}-\d{4}\.ptbackup$/);

    // Nothing is removed by creating or saving the file.
    for (const [id, bytes] of originals) expect(await bytesOf(db, id)).toEqual(bytes);

    const verified = await archive.verifySavedFile(made.value.file.blob, 'long-password', made.value);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const committed = await archive.commit(verified.value);
    expect(committed).toMatchObject({ ok: true, value: { archived: 5 } });
    if (committed.ok) expect(committed.value.freedBytes).toBeGreaterThan(0);
    for (const id of plan.ids) {
      const img = (await db.images.get(id))!;
      expect(img.bytes).toBeLessThan(200 * 1024);
      expect(img.bytes).toBe(img.blob.size);
    }
    const registry = parseArchiveRegistry((await db.meta.get(ARCHIVE_REGISTRY_KEY))?.value);
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({ id: 'arc1', count: 5, bytes: 5 * 200 * 1024, restoredAt: null });
    // Already-archived photos are not offered again.
    expect((await archive.plan(6)).ids).toEqual([]);

    const restored = await archive.restore(made.value.file.blob, { password: 'long-password' });
    expect(restored).toEqual({ ok: true, value: { restored: 5, skipped: 0 } });
    for (const [id, bytes] of originals) expect(await bytesOf(db, id)).toEqual(bytes);
    expect(parseArchiveRegistry((await db.meta.get(ARCHIVE_REGISTRY_KEY))?.value)[0]).toMatchObject({ imageIds: [], restoredAt: expect.any(Number) });
  });

  it('refuses to verify a different file (another archive, a full backup, wrong password) and removes nothing', async () => {
    const { db, seeded, archive, local } = await setup();
    const first = await archive.createFile(seeded.imageIds, null);
    const second = await archive.createFile(seeded.imageIds, null);
    if (!first.ok || !second.ok) throw new Error('export');
    expect(await archive.verifySavedFile(second.value.file.blob, null, first.value)).toEqual({ ok: false, error: 'different_file' });
    const full = await local.exportFile({ password: null });
    if (!full.ok) throw new Error('export');
    expect(await archive.verifySavedFile(full.value.blob, null, first.value)).toEqual({ ok: false, error: 'different_file' });
    const enc = await archive.createFile(seeded.imageIds, 'long-password');
    if (!enc.ok) throw new Error('export');
    expect(await archive.verifySavedFile(enc.value.file.blob, 'wrong-password', enc.value)).toEqual({ ok: false, error: 'wrong_password' });
    const corrupt = new Uint8Array(await first.value.file.blob.arrayBuffer());
    corrupt[200] ^= 0xff;
    expect((await archive.verifySavedFile(new Blob([corrupt]), null, first.value)).ok).toBe(false);
    expect((await db.images.get(seeded.imageIds[0]!))!.bytes).toBe(200 * 1024);
  });

  it('a photo changed after the file was made keeps its current bytes', async () => {
    const { db, seeded, archive } = await setup();
    const made = await archive.createFile(seeded.imageIds, null);
    if (!made.ok) throw new Error('export');
    const verified = await archive.verifySavedFile(made.value.file.blob, null, made.value);
    if (!verified.ok) throw new Error(verified.error);
    const changed = seeded.imageIds[2]!;
    const replacement = new Blob([seededBytes(150 * 1024, 77) as BlobPart], { type: 'image/jpeg' });
    await db.images.update(changed, { blob: replacement, bytes: replacement.size });
    const r = await archive.commit(verified.value);
    expect(r).toMatchObject({ ok: true, value: { archived: 4 } });
    expect((await db.images.get(changed))!.bytes).toBe(150 * 1024);
    expect(parseArchiveRegistry((await db.meta.get(ARCHIVE_REGISTRY_KEY))?.value)[0]!.imageIds).not.toContain(changed);
  });

  it('the full restore refuses a photo archive (it would wipe all data); the archive restore refuses a full backup', async () => {
    const { seeded, archive, local } = await setup();
    const made = await archive.createFile(seeded.imageIds, null);
    if (!made.ok) throw new Error('export');
    expect(await local.importFile(made.value.file.blob)).toEqual({ ok: false, error: 'photo_archive' });
    const summary = await local.verifyFile(made.value.file.blob, null);
    expect(summary.ok && summary.value).toMatchObject({ kind: 'photos', archiveId: made.value.archiveId });
    const full = await local.exportFile();
    if (!full.ok) throw new Error('export');
    expect(await archive.restore(full.value.blob)).toEqual({ ok: false, error: 'not_a_photo_archive' });
  });

  it('a full backup made after archiving carries placeholders + registry; restoring it then the archive gives everything back', async () => {
    const { f, db, seeded, archive } = await setup();
    const originals = await Promise.all(seeded.imageIds.map((id) => bytesOf(db, id)));
    const made = await archive.createFile(seeded.imageIds, null);
    if (!made.ok) throw new Error('export');
    const verified = await archive.verifySavedFile(made.value.file.blob, null, made.value);
    if (!verified.ok) throw new Error('verify');
    await archive.commit(verified.value);
    const meta = memoryBackupMetaStore();
    const full = await new LocalBackupService({ db, meta, appVersion: '1', now: () => new Date() }).exportFile();
    if (!full.ok) throw new Error('export');

    // New phone.
    const phone = f.open();
    const phoneLocal = new LocalBackupService({ db: phone, meta: memoryBackupMetaStore(), appVersion: '1', now: () => new Date() });
    expect((await phoneLocal.importFile(full.value.blob)).ok).toBe(true);
    expect(parseArchiveRegistry((await phone.meta.get(ARCHIVE_REGISTRY_KEY))?.value)[0]!.imageIds).toHaveLength(5);
    const phoneArchive = new PhotoArchiveService({ db: phone, downscaler: new ShrinkingDownscaler(), appVersion: '1', now: () => new Date(), openFile: (b, o) => phoneLocal.openFile(b, o) });
    expect(await phoneArchive.restore(made.value.file.blob)).toEqual({ ok: true, value: { restored: 5, skipped: 0 } });
    expect(await Promise.all(seeded.imageIds.map((id) => bytesOf(phone, id)))).toEqual(originals);
  });
});
