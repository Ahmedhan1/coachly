import { describe, expect, it } from 'vitest';
import { ORPHAN_GRACE_MS } from '@/domain/backup';
import { seedDatabase, seededBytes, ShrinkingDownscaler, testDbFactory } from '@/services/backup/testFixtures';
import { FakeStorageService } from './fakeStorageService';
import { StorageCleanupService } from './storageReport';

const MB = 1024 * 1024;

async function setup() {
  const db = testDbFactory().open();
  const seeded = await seedDatabase(db, { images: 4, imageBytes: 4096 });
  // An orphan saved long ago, and one saved just now (sheet still open).
  const old = await seeded.repos.images.save({ blob: new Blob([seededBytes(1000, 9) as BlobPart], { type: 'image/jpeg' }), width: 10, height: 10 });
  await db.images.update(old.id, { createdAt: 1 });
  const fresh = await seeded.repos.images.save({ blob: new Blob([seededBytes(1000, 10) as BlobPart], { type: 'image/jpeg' }), width: 10, height: 10 });
  const latest = Math.max(...(await db.images.toArray()).map((i) => i.createdAt));
  const now = () => new Date(latest + 1000);
  const storage = new FakeStorageService('granted', { usageBytes: 13 * MB, quotaBytes: 2150 * MB });
  const service = new StorageCleanupService({ db, storage, images: new ShrinkingDownscaler(), now });
  return { db, seeded, old, fresh, service, now };
}

describe('StorageCleanupService', () => {
  it('reports photos by owner (client photo + progress photos), unused ones, and client capacity', async () => {
    const { service, seeded, old } = await setup();
    const r = await service.report();
    // image 0 = client photo, images 1..3 = progress photos.
    expect(r.byCategory.clientPhotos.count).toBe(4);
    expect(r.byCategory.other.count).toBe(2);
    expect(r.unused.ids).toEqual([old.id]);
    expect(r.clientCount).toBe(1);
    expect(r.clientsThatFit).toBeGreaterThan(100);
    expect(r.otherBytes).toBe(13 * MB - r.imageBytes);
    expect(seeded.imageIds.every((id) => !r.unused.ids.includes(id))).toBe(true);
  });

  it('deletes only unreferenced, old photos even if asked to delete used ones', async () => {
    const { service, seeded, old, fresh, db } = await setup();
    const res = await service.deleteUnused([old.id, fresh.id, seeded.imageIds[0]!, seeded.imageIds[2]!]);
    expect(res.deleted).toBe(1);
    expect(await db.images.get(old.id)).toBeUndefined();
    expect(await db.images.get(fresh.id)).toBeDefined();
    expect(await db.images.get(seeded.imageIds[0]!)).toBeDefined();
    expect(await db.images.get(seeded.imageIds[2]!)).toBeDefined();
  });

  it('keeps photos referenced by a soft-deleted row (undo must bring the photo back)', async () => {
    const { service, seeded, db } = await setup();
    const extra = await seeded.repos.images.save({ blob: new Blob([seededBytes(500, 3) as BlobPart], { type: 'image/jpeg' }), width: 10, height: 10 });
    await db.images.update(extra.id, { createdAt: 1 });
    const c = await seeded.repos.clients.create({ ...(await db.clients.toArray())[0]!, name: 'x', photoId: extra.id } as never);
    await seeded.repos.clients.softDelete(c.id);
    await service.deleteUnused([extra.id]);
    expect(await db.images.get(extra.id)).toBeDefined();
  });

  it('shrinks big JPEGs in place (same id, smaller bytes) and leaves PNGs alone', async () => {
    const { db, seeded } = await setup();
    const id = seeded.imageIds[1]!;
    const before = (await db.images.get(id))!;
    const png = await seeded.repos.images.save({ blob: new Blob([seededBytes(5000, 4) as BlobPart], { type: 'image/png' }), width: 3000, height: 3000 });
    const halving = {
      downscale: async (input: Blob) => ({ blob: new Blob([(await input.arrayBuffer()).slice(0, input.size / 2)], { type: 'image/jpeg' }), width: 600, height: 450 }),
    };
    const svc = new StorageCleanupService({ db, storage: new FakeStorageService(), images: halving });
    const res = await svc.shrink([id, png.id, 'missing']);
    expect(res.shrunk).toBe(1);
    const after = (await db.images.get(id))!;
    expect(after.bytes).toBeLessThan(before.bytes);
    expect(after.bytes).toBe(after.blob.size);
    expect((await db.images.get(png.id))!.bytes).toBe(5000);
    expect(ORPHAN_GRACE_MS).toBeGreaterThan(0);
  });
});
