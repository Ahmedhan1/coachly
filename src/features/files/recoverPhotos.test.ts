import { describe, expect, it } from 'vitest';
import type { AppServices } from '@/app/services';
import { createTestData } from '@/data/testing';
import type { ImageId } from '@/domain/models';
import { FakeCloudFilesClient } from '@/services/files/fakeCloudFilesClient';
import { FILES_KEY_META, FileSyncService } from '@/services/files/fileSyncService';
import { memoryMetaStore } from '@/services/meta/metaStore';
import { FakeImageDownscaler } from '@/services/storage/fakeImageDownscaler';
import { PHOTOS_TO_RECOVER_KEY, recoverPhotosIfPending } from './photoRecovery';
import { recoverPhotos } from './recoverPhotos';

const FULL = 'FULL-SIZE-PHOTO-'.repeat(200);

/** One phone: its own database and meta, sharing the bucket (and, after a restore, the files key). */
function phone(bucket: FakeCloudFilesClient, filesKey?: string) {
  const data = createTestData();
  const meta = memoryMetaStore(filesKey ? { [FILES_KEY_META]: filesKey } : {});
  const images = new FakeImageDownscaler();
  const files = new FileSyncService({ client: bucket, files: data.repos.cloudFiles, images: data.repos.images, meta, downscaler: images, now: data.clock });
  const services = { data: { repos: data.repos }, images, meta, online: { files } } as unknown as Pick<AppServices, 'data' | 'images' | 'online' | 'meta'>;
  return { ...data, meta, files, services };
}

async function newClient(repos: ReturnType<typeof createTestData>['repos'], photoId: string | null) {
  return repos.clients.create({
    name: 'سارة', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
    package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: photoId as ImageId | null,
  });
}

describe('recoverPhotos', () => {
  it('a restored phone with thumbnail-only photos gets the full-size ones back from the bucket', async () => {
    const bucket = new FakeCloudFilesClient();
    // Phone A: a full-size client photo, uploaded encrypted.
    const a = phone(bucket);
    const full = await a.repos.images.save({ blob: new Blob([FULL], { type: 'image/jpeg' }), width: 1200, height: 900 });
    const client = await newClient(a.repos, full.id);
    await a.repos.cloudFiles.put('client_photo', client.id, { imageId: full.id, mime: 'image/jpeg' });
    await a.files.run();
    const key = String(await a.meta.get(FILES_KEY_META));

    // Phone B after a thumbnail-only restore: same client id, a tiny picture, the files key from the backup.
    const b = phone(bucket, key);
    const thumb = await b.repos.images.save({ blob: new Blob(['thumb'], { type: 'image/jpeg' }), width: 32, height: 24 });
    await b.db.clients.add({ ...(await a.repos.clients.get(client.id))!, photoId: thumb.id as ImageId, photoThumbId: null });

    expect(await recoverPhotos(b.services)).toBe(1);
    const restored = await b.repos.clients.get(client.id);
    expect(await (await b.repos.images.getBlob(restored!.photoId!))?.text()).toBe(FULL);
    expect(restored!.photoThumbId).not.toBeNull();
    // Already synced: nothing is uploaded again.
    expect((await b.repos.cloudFiles.find('client_photo', client.id))?.state).toBe('synced');
    // A second pass finds nothing to do.
    expect(await recoverPhotos(b.services)).toBe(0);
  });

  it('without the files key (no restore yet) nothing can be opened, and nothing breaks', async () => {
    const bucket = new FakeCloudFilesClient();
    const a = phone(bucket);
    const full = await a.repos.images.save({ blob: new Blob([FULL], { type: 'image/jpeg' }), width: 1200, height: 900 });
    const client = await newClient(a.repos, full.id);
    await a.repos.cloudFiles.put('client_photo', client.id, { imageId: full.id, mime: 'image/jpeg' });
    await a.files.run();
    const b = phone(bucket);
    await b.db.clients.add({ ...(await a.repos.clients.get(client.id))!, photoId: null });
    expect(await recoverPhotos(b.services)).toBe(0);
  });

  it('runs only after a restore asked for it, then clears the request', async () => {
    const b = phone(new FakeCloudFilesClient());
    expect(await recoverPhotosIfPending(b.services)).toBe(0);
    await b.meta.set(PHOTOS_TO_RECOVER_KEY, true);
    await recoverPhotosIfPending(b.services);
    expect(await b.meta.get(PHOTOS_TO_RECOVER_KEY)).toBeNull();
  });
});
