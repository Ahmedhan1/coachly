import { describe, expect, it } from 'vitest';
import { rowTableNames } from './backupIO';
import { LATEST_VERSION } from './schema';
import { createTestData, migrateFrom } from './testing';

describe('migration v2 → v3 (cloudFiles)', () => {
  it('adds the empty cloudFiles table and keeps every existing row', async () => {
    const db = await migrateFrom(2, async (old) => {
      await old.table('clients').add({ id: 'c1', name: 'نورهان', endDate: null, createdAt: 1, updatedAt: 1, demo: false, deletedAt: null });
      await old.table('images').add({ id: 'img1', createdAt: 1, blob: new Blob(['x']) });
    });
    expect(db.verno).toBe(LATEST_VERSION);
    expect(await db.clients.count()).toBe(1);
    expect(await db.images.count()).toBe(1);
    expect(await db.cloudFiles.count()).toBe(0);
    db.close();
  });

  it('is never exported in a backup (device-local queue)', async () => {
    const { db } = createTestData();
    await db.open();
    expect(rowTableNames(db)).not.toContain('cloudFiles');
    expect(rowTableNames(db)).toContain('clients');
    db.close();
  });
});

describe('CloudFileRepository', () => {
  it('queues a client photo, then marks it synced with the remote id', async () => {
    const { repos, clock } = createTestData();
    const rec = await repos.cloudFiles.put('client_photo', 'c1', { imageId: 'img1', mime: 'image/jpeg' });
    expect(rec).toMatchObject({ kind: 'client_photo', ref: 'c1', imageId: 'img1', state: 'pending', remoteId: null });
    expect((await repos.cloudFiles.due(clock())).map((r) => r.id)).toEqual([rec.id]);
    await repos.cloudFiles.markSynced(rec.id, 'remote1', rec.updatedAt);
    expect(await repos.cloudFiles.get(rec.id)).toMatchObject({ state: 'synced', remoteId: 'remote1' });
    expect(await repos.cloudFiles.due(clock())).toEqual([]);
  });

  it('a new photo for the same client reuses the record and keeps the remote id (replace, not duplicate)', async () => {
    const { repos, clock } = createTestData();
    const first = await repos.cloudFiles.put('client_photo', 'c1', { imageId: 'img1', mime: 'image/jpeg' });
    await repos.cloudFiles.markSynced(first.id, 'remote1', first.updatedAt);
    clock.advance(1000);
    const second = await repos.cloudFiles.put('client_photo', 'c1', { imageId: 'img2', mime: 'image/jpeg' });
    expect(second).toMatchObject({ id: first.id, remoteId: 'remote1', imageId: 'img2', state: 'pending' });
    expect(await repos.cloudFiles.list()).toHaveLength(1);
  });

  it('keeps it pending when it changed during the upload', async () => {
    const { repos, clock } = createTestData();
    const v1 = await repos.cloudFiles.put('trainer_photo', null, { imageId: 'img1', mime: 'image/jpeg' });
    clock.advance(5);
    await repos.cloudFiles.put('trainer_photo', null, { imageId: 'img2', mime: 'image/jpeg' });
    await repos.cloudFiles.markSynced(v1.id, 'remote1', v1.updatedAt);
    expect(await repos.cloudFiles.get(v1.id)).toMatchObject({ state: 'pending', remoteId: 'remote1', imageId: 'img2' });
  });

  it('stores PDF bytes until uploaded, then drops them', async () => {
    const { repos } = createTestData();
    const rec = await repos.cloudFiles.put('pdf', 'pdf1', { bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf', name: 'برنامج.pdf' });
    expect(new Uint8Array(rec.bytes!)).toEqual(new Uint8Array([37, 80, 68, 70]));
    await repos.cloudFiles.markSynced(rec.id, 'r', rec.updatedAt);
    expect((await repos.cloudFiles.get(rec.id))?.bytes).toBeNull();
  });

  it('backs off after failures (1 min, 2 min, ...)', async () => {
    const { repos, clock } = createTestData();
    const rec = await repos.cloudFiles.put('pdf', 'p', { bytes: new Uint8Array(1), mime: 'application/pdf' });
    await repos.cloudFiles.markFailed(rec.id);
    expect(await repos.cloudFiles.due(clock())).toEqual([]);
    clock.advance(60_000);
    expect(await repos.cloudFiles.due(clock())).toHaveLength(1);
    await repos.cloudFiles.markFailed(rec.id);
    clock.advance(119_999);
    expect(await repos.cloudFiles.due(clock())).toEqual([]);
    clock.advance(1);
    expect(await repos.cloudFiles.due(clock())).toHaveLength(1);
  });

  it('delete: forgotten at once when never uploaded, queued for a remote delete otherwise', async () => {
    const { repos, clock } = createTestData();
    await repos.cloudFiles.put('invoice', 'pay1', { imageId: 'i', mime: 'image/jpeg' });
    await repos.cloudFiles.remove('invoice', 'pay1');
    expect(await repos.cloudFiles.list()).toEqual([]);

    const up = await repos.cloudFiles.put('invoice', 'pay2', { imageId: 'i', mime: 'image/jpeg' });
    await repos.cloudFiles.markSynced(up.id, 'r2', up.updatedAt);
    await repos.cloudFiles.remove('invoice', 'pay2');
    expect(await repos.cloudFiles.get(up.id)).toMatchObject({ state: 'deleting', remoteId: 'r2' });
    expect(await repos.cloudFiles.find('invoice', 'pay2')).toBeUndefined();
    expect((await repos.cloudFiles.due(clock())).map((r) => r.state)).toEqual(['deleting']);
    await repos.cloudFiles.forget(up.id);
    expect(await repos.cloudFiles.list()).toEqual([]);
  });
});

describe('purge and cloud copies', () => {
  it('a client deleted for good loses its cloud photo too, and the picture is purged', async () => {
    const { purgeExpired } = await import('./purge');
    const { repos, db, clock } = createTestData();
    const img = await repos.images.save({ blob: new Blob(['x'], { type: 'image/jpeg' }), width: 1, height: 1 });
    const client = await repos.clients.create({
      name: 'نورهان', phone: '', gender: null, birthDate: null, goal: 'fat_loss', goalNote: '', injuries: [],
      measurements: {}, package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: img.id,
    } as never);
    const copy = await repos.cloudFiles.put('client_photo', client.id, { imageId: img.id, mime: 'image/jpeg' });
    await repos.cloudFiles.markSynced(copy.id, 'remote-1', copy.updatedAt);
    await repos.clients.softDelete(client.id);
    clock.advance(400 * 86_400_000);
    const report = await purgeExpired(db, new Date(clock()));
    expect(report.images).toBe(1);
    expect(await repos.cloudFiles.get(copy.id)).toMatchObject({ state: 'deleting', remoteId: 'remote-1', imageId: null });
  });
});
