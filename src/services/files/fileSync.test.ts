import { describe, expect, it } from 'vitest';
import { createTestData } from '@/data/testing';
import { memoryMetaStore } from '@/data/metaStore';
import { FakeImageDownscaler } from '@/services/storage/fakeImageDownscaler';
import { generateRawKey, openWithKey, sealWithKey } from '../../../shared/envelope';
import { base64UrlEncode } from '../../../shared/bytes';
import { packFile, unpackFile } from '@/domain/files';
import { FakeCloudFilesClient } from './fakeCloudFilesClient';
import { FILES_KEY_META, FileSyncService } from './fileSyncService';

function setup() {
  const data = createTestData();
  const client = new FakeCloudFilesClient();
  const meta = memoryMetaStore();
  const sync = new FileSyncService({ client, files: data.repos.cloudFiles, images: data.repos.images, meta, downscaler: new FakeImageDownscaler(), now: data.clock });
  return { ...data, client, meta, sync };
}

async function photo(repos: ReturnType<typeof createTestData>['repos'], text = 'jpeg') {
  return repos.images.save({ blob: new Blob([text], { type: 'image/jpeg' }), width: 10, height: 10 });
}

describe('FileSyncService upload', () => {
  it('uploads a client photo encrypted: the server never gets the plain bytes', async () => {
    const { repos, client, sync, meta } = setup();
    const img = await photo(repos, 'PLAIN-JPEG-BYTES');
    await repos.cloudFiles.put('client_photo', 'client1', { imageId: img.id, mime: 'image/jpeg' });
    expect(await sync.run()).toEqual({ uploaded: 1, deleted: 0, failed: 0 });

    const [stored] = [...client.files.values()];
    expect(stored!.info).toMatchObject({ kind: 'client_photo', ref: 'client1' });
    expect(new TextDecoder().decode(stored!.bytes)).not.toContain('PLAIN-JPEG-BYTES');
    expect(new TextDecoder().decode(stored!.bytes.subarray(0, 4))).toBe('PTK1');
    const key = await sync.key();
    expect(typeof (await meta.get(FILES_KEY_META))).toBe('string');
    const opened = await openWithKey(key, stored!.bytes);
    const unpacked = opened.ok ? unpackFile(opened.data) : null;
    expect(unpacked?.header.mime).toBe('image/jpeg');
    expect(new TextDecoder().decode(unpacked!.bytes)).toBe('PLAIN-JPEG-BYTES');
    expect((await repos.cloudFiles.find('client_photo', 'client1'))?.state).toBe('synced');
  });

  it('a new photo for the same client replaces the remote copy instead of adding one', async () => {
    const { repos, client, sync, clock } = setup();
    await repos.cloudFiles.put('client_photo', 'client1', { imageId: (await photo(repos)).id, mime: 'image/jpeg' });
    await sync.run();
    clock.advance(1000);
    await repos.cloudFiles.put('client_photo', 'client1', { imageId: (await photo(repos, 'second')).id, mime: 'image/jpeg' });
    await sync.run();
    expect(client.files.size).toBe(1);
    expect(client.calls.filter((c) => c.startsWith('replace'))).toHaveLength(1);
  });

  it('after a restore (no local record) it finds the remote copy by kind + ref and replaces it', async () => {
    const { repos, client, sync } = setup();
    const existing = client.seed('trainer_photo', new Uint8Array([1, 2, 3]));
    await repos.cloudFiles.put('trainer_photo', null, { imageId: (await photo(repos)).id, mime: 'image/jpeg' });
    await sync.run();
    expect(client.files.size).toBe(1);
    expect(client.calls).toContain(`replace ${existing.id}`);
  });

  it('offline: nothing is lost, it backs off and uploads once the network is back', async () => {
    const { repos, client, sync, clock } = setup();
    await repos.cloudFiles.put('pdf', 'pdf1', { bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf', name: 'برنامج.pdf' });
    await repos.cloudFiles.put('invoice', 'pay1', { imageId: (await photo(repos)).id, mime: 'image/jpeg' });
    client.failWith = 'offline';
    expect(await sync.run()).toEqual({ uploaded: 0, deleted: 0, failed: 1 });
    client.failWith = null;
    expect(await sync.run()).toEqual({ uploaded: 1, deleted: 0, failed: 0 }); // the invoice; the PDF waits out its back-off
    clock.advance(60_000);
    expect(await sync.run()).toEqual({ uploaded: 1, deleted: 0, failed: 0 });
    expect(client.files.size).toBe(2);
    expect((await repos.cloudFiles.find('pdf', 'pdf1'))?.bytes).toBeNull();
  });

  it('deletes the remote copy, then forgets the record', async () => {
    const { repos, client, sync } = setup();
    await repos.cloudFiles.put('invoice', 'pay1', { imageId: (await photo(repos)).id, mime: 'image/jpeg' });
    await sync.run();
    await repos.cloudFiles.remove('invoice', 'pay1');
    expect(await sync.run()).toEqual({ uploaded: 0, deleted: 1, failed: 0 });
    expect(client.files.size).toBe(0);
    expect(await repos.cloudFiles.list()).toEqual([]);
  });

  it('opens a file back from the cloud with its type and name', async () => {
    const { repos, client, sync } = setup();
    const rec = await repos.cloudFiles.put('pdf', 'pdf1', { bytes: new Uint8Array([37, 80, 68, 70]), mime: 'application/pdf', name: 'برنامج نورهان.pdf' });
    await sync.run();
    const remoteId = (await repos.cloudFiles.get(rec.id))!.remoteId!;
    expect(await sync.open(remoteId)).toEqual({ mime: 'application/pdf', name: 'برنامج نورهان.pdf', bytes: new Uint8Array([37, 80, 68, 70]) });
    client.failWith = 'network';
    expect(await sync.open(remoteId)).toBeNull();
  });

  it('runs once at a time', async () => {
    const { repos, client, sync } = setup();
    await repos.cloudFiles.put('pdf', 'p', { bytes: new Uint8Array(4), mime: 'application/pdf' });
    await Promise.all([sync.run(), sync.run()]);
    expect(client.calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
  });
});

describe('FileSyncService.pullClientPhotos', () => {
  it("stores the client's own photo from their page, then deletes it from the server", async () => {
    const { client, sync, repos } = setup();
    const linkKey = generateRawKey();
    const env = await sealWithKey(linkKey, packFile({ mime: 'image/jpeg' }, new TextEncoder().encode('selfie')));
    client.seed('client_photo', env, { source: 'client', shareId: 'share-noorhan' });
    client.seed('client_photo', env, { source: 'client', shareId: 'share-of-a-deleted-page' });
    const imported = await sync.pullClientPhotos([{ shareId: 'share-noorhan', key: base64UrlEncode(linkKey), clientId: 'c1' }]);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.clientId).toBe('c1');
    expect(await repos.images.getBlob(imported[0]!.imageId)).toBeDefined();
    expect([...client.files.values()].map((f) => f.info.shareId)).toEqual(['share-of-a-deleted-page']);
  });

  it('ignores a photo it cannot decrypt (wrong key) and keeps it for later', async () => {
    const { client, sync } = setup();
    const env = await sealWithKey(generateRawKey(), packFile({ mime: 'image/jpeg' }, new Uint8Array(3)));
    client.seed('client_photo', env, { source: 'client', shareId: 's1' });
    expect(await sync.pullClientPhotos([{ shareId: 's1', key: base64UrlEncode(generateRawKey()), clientId: 'c1' }])).toEqual([]);
    expect(client.files.size).toBe(1);
  });
});
