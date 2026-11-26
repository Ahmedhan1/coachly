import { describe, expect, it } from 'vitest';
import { generateRawKey, openWithKey, sealWithKey } from '../../shared/envelope';
import { base64UrlEncode } from '../../shared/bytes';
import type { CloudFileInfo } from '../../shared/files';
import { MemoryObjectStore } from '../src/files/objectStore';
import { fileKey } from '../src/files/routes';
import { envelopeBytes, freshIp, harness, readJson, storedBytes, type Harness } from './helpers';
import { SAMPLE_DOCUMENT } from './sampleDocument';

async function setup(store = new MemoryObjectStore()) {
  const h = await harness({ objectStore: store });
  return { h, store, token: await h.account() };
}

function upload(h: Harness, token: string, body: Uint8Array, query: string, method = 'POST', path = '/api/files'): Promise<Response> {
  return h.authed(`${path}${query}`, token, { method, body, headers: { 'Content-Length': String(body.length) } });
}

async function created(res: Response): Promise<CloudFileInfo> {
  expect(res.status).toBe(201);
  return ((await readJson(res)) as { file: CloudFileInfo }).file;
}

async function list(h: Harness, token: string, query = ''): Promise<CloudFileInfo[]> {
  const res = await h.authed(`/api/files${query}`, token);
  expect(res.status).toBe(200);
  return ((await readJson(res)) as { files: CloudFileInfo[] }).files;
}

describe('files API auth', () => {
  it('needs an approved account on every trainer endpoint', async () => {
    const { h } = await setup();
    for (const [method, path] of [
      ['GET', '/api/files'],
      ['POST', '/api/files?kind=pdf'],
      ['GET', '/api/files/AAAAAAAAAAAAAAAAAAAAAA'],
      ['PUT', '/api/files/AAAAAAAAAAAAAAAAAAAAAA'],
      ['DELETE', '/api/files/AAAAAAAAAAAAAAAAAAAAAA'],
    ] as const) {
      expect((await h.send(path, { method })).status, `${method} ${path}`).toBe(401);
      expect((await h.authed(path, 'abc.def', { method })).status, `${method} ${path}`).toBe(401);
    }
  });

  it('refuses a disabled account', async () => {
    const { h, token } = await setup();
    await h.disable(token);
    expect((await h.authed('/api/files', token)).status).toBe(403);
  });
});

describe('files CRUD', () => {
  it('creates, lists, downloads, replaces and deletes an encrypted file', async () => {
    const { h, store, token } = await setup();
    const key = generateRawKey();
    const photo = await sealWithKey(key, new TextEncoder().encode('jpeg bytes of a client photo'));

    const file = await created(await upload(h, token, photo, '?kind=client_photo&ref=client_123'));
    expect(file).toMatchObject({ kind: 'client_photo', ref: 'client_123', source: 'trainer', shareId: null, size: photo.length });
    expect(store.objects.size).toBe(1);

    expect(await list(h, token)).toEqual([file]);
    expect(await list(h, token, '?kind=client_photo&ref=client_123')).toEqual([file]);
    expect(await list(h, token, '?kind=pdf')).toEqual([]);

    const down = await h.authed(`/api/files/${file.id}`, token);
    expect(down.status).toBe(200);
    expect(down.headers.get('X-File-Kind')).toBe('client_photo');
    const opened = await openWithKey(key, new Uint8Array(await down.arrayBuffer()));
    expect(opened.ok && new TextDecoder().decode(opened.data)).toBe('jpeg bytes of a client photo');

    h.clock.now += 60;
    const newer = await sealWithKey(key, new TextEncoder().encode('a newer photo, a bit longer'));
    const res = await upload(h, token, newer, '', 'PUT', `/api/files/${file.id}`);
    expect(res.status).toBe(200);
    const replaced = ((await readJson(res)) as { file: CloudFileInfo }).file;
    expect(replaced).toMatchObject({ id: file.id, size: newer.length, createdAt: file.createdAt, updatedAt: h.clock.now });
    expect(await list(h, token, `?since=${file.updatedAt}`)).toEqual([replaced]);

    expect((await h.authed(`/api/files/${file.id}`, token, { method: 'DELETE' })).status).toBe(200);
    expect(store.objects.size).toBe(0);
    expect(await list(h, token)).toEqual([]);
    expect((await h.authed(`/api/files/${file.id}`, token)).status).toBe(404);
  });

  it('keeps every kind the app uses and stores the bytes under the account', async () => {
    const { h, store, token } = await setup();
    for (const kind of ['client_photo', 'trainer_photo', 'thumbnail', 'invoice', 'pdf']) {
      const f = await created(await upload(h, token, envelopeBytes('PTK1', 64), `?kind=${kind}`));
      expect(f.ref).toBeNull();
      const account = [...store.objects.keys()].find((k) => k.endsWith(`/${f.id}`));
      expect(account).toMatch(/^files\/[^/]+\/[A-Za-z0-9_-]+$/);
    }
    expect((await list(h, token)).map((f) => f.kind).sort()).toEqual(['client_photo', 'invoice', 'pdf', 'thumbnail', 'trainer_photo']);
  });

  it("one trainer cannot see, read, replace or delete another trainer's files", async () => {
    const { h, token } = await setup();
    const other = await h.account('كابتن تاني');
    const file = await created(await upload(h, token, envelopeBytes('PTK1', 64), '?kind=pdf'));
    expect(await list(h, other)).toEqual([]);
    expect((await h.authed(`/api/files/${file.id}`, other)).status).toBe(404);
    expect((await upload(h, other, envelopeBytes('PTK1', 64), '', 'PUT', `/api/files/${file.id}`)).status).toBe(404);
    expect((await h.authed(`/api/files/${file.id}`, other, { method: 'DELETE' })).status).toBe(404);
    expect((await h.authed(`/api/files/${file.id}`, token)).status).toBe(200);
  });

  it('refuses plain (unencrypted) bytes, bad kinds, bad refs and bodies without a length', async () => {
    const { h, token } = await setup();
    expect((await upload(h, token, new TextEncoder().encode('x'.repeat(100)), '?kind=pdf')).status).toBe(400);
    expect((await upload(h, token, envelopeBytes('PTP1', 64), '?kind=pdf')).status).toBe(400);
    expect((await upload(h, token, envelopeBytes('PTK1', 64), '?kind=selfie')).status).toBe(400);
    expect((await upload(h, token, envelopeBytes('PTK1', 64), '?kind=client_upload')).status).toBe(400);
    expect((await upload(h, token, envelopeBytes('PTK1', 64), '?kind=pdf&ref=Sara%20Mahmoud')).status).toBe(400);
    expect((await h.authed('/api/files?kind=pdf', token, { method: 'POST' })).status).toBe(411);
    expect((await h.authed('/api/files?kind=selfie', token)).status).toBe(400);
    expect((await h.authed('/api/files/bad', token)).status).toBe(404);
    expect((await h.authed('/api/files', token, { method: 'DELETE' })).status).toBe(405);
  });

  it('caps one file and the account total', async () => {
    const { h, token } = await setup();
    h.deps.cloud.files.maxBytes = 1000;
    h.deps.cloud.files.accountMaxBytes = 1500;
    expect((await upload(h, token, envelopeBytes('PTK1', 1001), '?kind=pdf')).status).toBe(413);
    await created(await upload(h, token, envelopeBytes('PTK1', 900), '?kind=pdf'));
    const over = await upload(h, token, envelopeBytes('PTK1', 700), '?kind=pdf');
    expect(over.status).toBe(507);
    expect(await readJson(over)).toEqual({ error: 'quota_exceeded', maxBytes: 1500 });
  });

  it('answers 502 when the storage service is down, and indexes nothing', async () => {
    const { h, store, token } = await setup();
    store.failing = true;
    expect((await upload(h, token, envelopeBytes('PTK1', 64), '?kind=pdf')).status).toBe(502);
    store.failing = false;
    expect(await list(h, token)).toEqual([]);
  });

  it('answers 503 files_unavailable when no bucket is configured', async () => {
    const h = await harness({ objectStore: null });
    const token = await h.account();
    const res = await h.authed('/api/files', token);
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'files_unavailable' });
  });
});

// ---- client page uploads ----

async function writeToken(key: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('pt-checkin-write') }, ikm, 256),
  );
}

async function publishShare(h: Harness, token: string, key: Uint8Array): Promise<string> {
  const shareId = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const data = await sealWithKey(key, new TextEncoder().encode(JSON.stringify(SAMPLE_DOCUMENT)));
  const hash = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(await writeToken(key)))));
  const res = await h.authed(`/api/share/${shareId}`, token, {
    method: 'PUT',
    body: data,
    headers: { 'Content-Length': String(data.length), 'X-Checkin-Key': hash },
  });
  expect(res.ok).toBe(true);
  return shareId;
}

async function clientUpload(h: Harness, shareId: string, key: Uint8Array, kind: string, body: Uint8Array, ip = freshIp(), tokenKey = key): Promise<Response> {
  return h.send(`/api/share/${shareId}/files?kind=${kind}`, {
    method: 'POST',
    body,
    ip,
    headers: { 'Content-Length': String(body.length), 'X-Checkin-Token': base64UrlEncode(await writeToken(tokenKey)) },
  });
}

describe('client page uploads', () => {
  it("a client's own photo reaches the trainer, encrypted with the link key; a new one replaces the old", async () => {
    const { h, store, token } = await setup();
    const key = generateRawKey();
    const shareId = await publishShare(h, token, key);
    const first = await sealWithKey(key, new TextEncoder().encode('selfie 1'));
    expect((await clientUpload(h, shareId, key, 'client_photo', first)).status).toBe(201);
    const files = await list(h, token, '?source=client');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ kind: 'client_photo', source: 'client', shareId, ref: null });

    h.clock.now += 10;
    const second = await sealWithKey(key, new TextEncoder().encode('selfie 2'));
    expect((await clientUpload(h, shareId, key, 'client_photo', second)).status).toBe(201);
    const after = await list(h, token, '?source=client');
    expect(after).toHaveLength(1);
    expect(after[0]!.id).not.toBe(files[0]!.id);
    expect(store.objects.size).toBe(1);
    const body = await (await h.authed(`/api/files/${after[0]!.id}`, token)).arrayBuffer();
    const opened = await openWithKey(key, new Uint8Array(body));
    expect(opened.ok && new TextDecoder().decode(opened.data)).toBe('selfie 2');
  });

  it('needs the write token of that page, a client kind and an envelope', async () => {
    const { h, token } = await setup();
    const key = generateRawKey();
    const shareId = await publishShare(h, token, key);
    const ok = envelopeBytes('PTK1', 64);
    expect((await clientUpload(h, shareId, key, 'client_photo', ok, freshIp(), generateRawKey())).status).toBe(403);
    expect((await clientUpload(h, shareId, key, 'pdf', ok)).status).toBe(400);
    expect((await clientUpload(h, shareId, key, 'client_upload', new Uint8Array(64).fill(1))).status).toBe(400);
    expect((await clientUpload(h, 'AAAAAAAAAAAAAAAAAAAAAAAA', key, 'client_photo', ok)).status).toBe(404);
    expect((await h.send(`/api/share/${shareId}/files`, { method: 'GET' })).status).toBe(405);
  });

  it('rate limits one IP, and revoking the page deletes what the client uploaded', async () => {
    const { h, store, token } = await setup();
    const key = generateRawKey();
    const shareId = await publishShare(h, token, key);
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await clientUpload(h, shareId, key, 'client_upload', envelopeBytes('PTK1', 64), ip)).status).toBe(201);
    expect((await clientUpload(h, shareId, key, 'client_upload', envelopeBytes('PTK1', 64), ip)).status).toBe(429);
    expect(store.objects.size).toBe(10);
    expect((await h.authed(`/api/share/${shareId}`, token, { method: 'DELETE' })).status).toBe(200);
    expect(store.objects.size).toBe(0);
    expect(await list(h, token)).toEqual([]);
  });

  it('keys the object under the trainer account, never under the page or a name', async () => {
    const { h, store, token } = await setup();
    const key = generateRawKey();
    const shareId = await publishShare(h, token, key);
    await clientUpload(h, shareId, key, 'client_photo', envelopeBytes('PTK1', 64));
    const [file] = await list(h, token);
    expect([...store.objects.keys()]).toEqual([fileKey(await h.accountId(token), file!.id)]);
  });
});

describe('files in the Worker R2 bucket (no iDrive keys set)', () => {
  it('stores in R2 under files/<account>/<id>, counts toward the global guard, and gives the bytes back on delete', async () => {
    const { env } = await import('cloudflare:workers');
    const h = await harness();
    const token = await h.account();
    const before = await storedBytes();
    const file = await created(await upload(h, token, envelopeBytes('PTK1', 4096), '?kind=client_photo&ref=c1'));
    expect(await env.BACKUPS.head(fileKey(await h.accountId(token), file.id))).not.toBeNull();
    expect(await storedBytes()).toBe(before + 4096);
    expect((await h.authed(`/api/files/${file.id}`, token)).status).toBe(200);
    expect((await h.authed(`/api/files/${file.id}`, token, { method: 'DELETE' })).status).toBe(200);
    expect(await storedBytes()).toBe(before);
  });

  it('refuses growth past the global guard with storage_full', async () => {
    const h = await harness({ cloudConfig: { storageGuardBytes: 1 } });
    const token = await h.account();
    const res = await upload(h, token, envelopeBytes('PTK1', 2048), '?kind=client_photo&ref=c2');
    expect([res.status, await readJson(res)]).toEqual([507, { error: 'storage_full' }]);
  });
});
