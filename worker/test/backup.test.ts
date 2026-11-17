import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { decodeLicenseToken } from '../../shared/license';
import { backupKey } from '../src/backup/store';
import { envelopeBytes, harness, readJson, storedBytes, type Harness } from './helpers';

const MiB = 1024 * 1024;

function put(h: Harness, token: string, body: Uint8Array, path = '/api/backup'): Promise<Response> {
  return h.authed(path, token, { method: 'PUT', body, headers: { 'Content-Length': String(body.length) } });
}

function lidOf(token: string): string {
  return decodeLicenseToken(token)?.payload.lid ?? '';
}

describe('backup auth', () => {
  const endpoints: Array<[string, string]> = [
    ['PUT', '/api/backup'],
    ['GET', '/api/backup'],
    ['HEAD', '/api/backup'],
    ['DELETE', '/api/backup'],
    ['POST', '/api/backup/uploads'],
    ['PUT', '/api/backup/uploads/AAAAAAAAAAAAAAAAAAAAAA/parts/1'],
    ['POST', '/api/backup/uploads/AAAAAAAAAAAAAAAAAAAAAA/complete'],
    ['DELETE', '/api/backup/uploads/AAAAAAAAAAAAAAAAAAAAAA'],
  ];

  it('answers 401 without a token or with a forged one, on every backup endpoint', async () => {
    const h = await harness();
    for (const [method, path] of endpoints) {
      expect((await h.send(path, { method })).status, `${method} ${path}`).toBe(401);
      expect((await h.authed(path, 'abc.def', { method })).status, `${method} ${path}`).toBe(401);
    }
  });

  it('answers 403 revoked for a revoked license on every backup endpoint', async () => {
    const h = await harness();
    const token = await h.license();
    await h.revoke(token);
    for (const [method, path] of endpoints) {
      const res = await h.authed(path, token, { method });
      expect(res.status, `${method} ${path}`).toBe(403);
      if (method !== 'HEAD') expect(await readJson(res)).toEqual({ error: 'revoked' });
    }
  });
});

describe('PUT /api/backup', () => {
  it('stores, reports and streams back the envelope; the second upload keeps the first as previous', async () => {
    const h = await harness();
    const token = await h.license();
    const first = envelopeBytes('PTP1', 2048, 1);
    const res = await put(h, token, first);
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ size: 2048, uploadedAt: h.clock.now, previousKept: false });

    const head = await h.authed('/api/backup', token, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('X-Backup-Size')).toBe('2048');
    expect(head.headers.get('X-Backup-Uploaded-At')).toBe(String(h.clock.now));

    const firstAt = h.clock.now;
    h.clock.now += 3600;
    const second = envelopeBytes('PTP1', 4096, 2);
    expect(await readJson(await put(h, token, second))).toMatchObject({ size: 4096, previousKept: true });

    const latest = await h.authed('/api/backup', token);
    expect(latest.headers.get('Content-Length')).toBe('4096');
    expect(new Uint8Array(await latest.arrayBuffer())).toEqual(second);
    const previous = await h.authed('/api/backup?which=previous', token);
    expect(new Uint8Array(await previous.arrayBuffer())).toEqual(first);
    expect(previous.headers.get('X-Backup-Uploaded-At')).toBe(String(firstAt));

    const head2 = await h.authed('/api/backup', token, { method: 'HEAD' });
    expect(head2.headers.get('X-Backup-Previous-Size')).toBe('2048');

    // Third upload overwrites the oldest slot: only the two newest remain.
    h.clock.now += 3600;
    const third = envelopeBytes('PTP1', 1024, 3);
    await put(h, token, third);
    expect(new Uint8Array(await (await h.authed('/api/backup?which=previous', token)).arrayBuffer())).toEqual(second);
  });

  it('keeps the R2 total in D1 in step with puts and deletes', async () => {
    const h = await harness();
    const token = await h.license();
    const before = await storedBytes();
    await put(h, token, envelopeBytes('PTP1', 1000));
    await put(h, token, envelopeBytes('PTP1', 3000));
    expect(await storedBytes()).toBe(before + 4000);
    await put(h, token, envelopeBytes('PTP1', 500)); // overwrites the 1000-byte slot
    expect(await storedBytes()).toBe(before + 3500);
    expect((await h.authed('/api/backup', token, { method: 'DELETE' })).status).toBe(200);
    expect(await storedBytes()).toBe(before);
    expect(await env.BACKUPS.head(backupKey(lidOf(token), 0))).toBeNull();
    expect((await h.authed('/api/backup', token)).status).toBe(404);
  });

  it('drops the previous copy when latest + previous would pass the per-trainer cap', async () => {
    const h = await harness({ cloudConfig: { backupMaxBytes: 10_000 } });
    const token = await h.license();
    await put(h, token, envelopeBytes('PTP1', 6000));
    const res = await put(h, token, envelopeBytes('PTP1', 6000, 9));
    expect(await readJson(res)).toMatchObject({ previousKept: false });
    expect((await h.authed('/api/backup?which=previous', token)).status).toBe(404);
  });

  it('refuses bodies over the cap, without a length, empty, or not a PTP1 envelope', async () => {
    const h = await harness({ cloudConfig: { backupMaxBytes: 5000, singlePutMaxBytes: 4000 } });
    const token = await h.license();
    const big = await put(h, token, envelopeBytes('PTP1', 5001));
    expect(big.status).toBe(413);
    expect(await readJson(big)).toEqual({ error: 'too_large', maxBytes: 5000 });
    const multi = await put(h, token, envelopeBytes('PTP1', 4500));
    expect(await readJson(multi)).toEqual({ error: 'use_multipart', maxBytes: 4000 });

    const wrong = await put(h, token, envelopeBytes('PTK1', 100));
    expect(wrong.status).toBe(400);
    expect(await readJson(wrong)).toEqual({ error: 'bad_format' });

    const noLength = await h.authed('/api/backup', token, { method: 'PUT', body: new ReadableStream({ start: (c) => c.close() }) });
    expect(noLength.status).toBe(411);
    const empty = await put(h, token, new Uint8Array(0));
    expect([empty.status, await readJson(empty)]).toEqual([400, { error: 'empty' }]);
  });

  it('refuses a body shorter than its Content-Length and keeps the old backup', async () => {
    const h = await harness();
    const token = await h.license();
    const good = envelopeBytes('PTP1', 300);
    await put(h, token, good);
    const res = await h.authed('/api/backup', token, {
      method: 'PUT',
      body: envelopeBytes('PTP1', 100),
      headers: { 'Content-Length': '200' },
    });
    expect(res.status).toBe(400);
    expect(new Uint8Array(await (await h.authed('/api/backup', token)).arrayBuffer())).toEqual(good);
  });

  it('answers storage_full for uploads that grow storage past the global guard, but allows same-size replacements', async () => {
    const used = await storedBytes();
    const h = await harness({ cloudConfig: { storageGuardBytes: used + 4200 } });
    const token = await h.license();
    expect((await put(h, token, envelopeBytes('PTP1', 4000))).status).toBe(201);

    const grow = await put(h, token, envelopeBytes('PTP1', 4500));
    expect(grow.status).toBe(507);
    expect(await readJson(grow)).toEqual({ error: 'storage_full' });

    const same = await put(h, token, envelopeBytes('PTP1', 4000, 5));
    expect(same.status).toBe(201);
    // Over the guard the previous copy is not kept either.
    expect(await readJson(same)).toMatchObject({ previousKept: false });

    const other = await h.license();
    expect((await put(h, other, envelopeBytes('PTP1', 2000))).status).toBe(507);
  });

  it('rate-limits uploads per license', async () => {
    const h = await harness();
    const token = await h.license();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await put(h, token, envelopeBytes('PTP1', 64))).status);
    expect(statuses.slice(0, 24).every((s) => s === 201)).toBe(true);
    expect(statuses[24]).toBe(429);
  });
});

describe('multipart backup', () => {
  // R2 requires every part but the last to be >= 5 MiB.
  const partBytes = 5 * MiB;

  it('uploads in parts, checks the magic on part 1 and part sizes, and completes as latest', async () => {
    const h = await harness({ cloudConfig: { backupPartBytes: partBytes } });
    const token = await h.license();
    const size = partBytes + 1234;
    const data = envelopeBytes('PTP1', size, 4);

    const created = await h.authed('/api/backup/uploads', token, { method: 'POST', body: JSON.stringify({ size }) });
    expect(created.status).toBe(201);
    const { uploadId, partSize, partCount } = (await created.json()) as { uploadId: string; partSize: number; partCount: number };
    expect([partSize, partCount]).toEqual([partBytes, 2]);

    const wrongSize = await put(h, token, data.slice(0, 1000), `/api/backup/uploads/${uploadId}/parts/1`);
    expect(await readJson(wrongSize)).toEqual({ error: 'wrong_part_size', expected: partBytes });
    const badMagic = await put(h, token, envelopeBytes('PTK1', partBytes), `/api/backup/uploads/${uploadId}/parts/1`);
    expect(await readJson(badMagic)).toEqual({ error: 'bad_format' });

    const parts = [];
    for (let n = 1; n <= partCount; n++) {
      const chunk = data.slice((n - 1) * partSize, Math.min(size, n * partSize));
      const res = await put(h, token, chunk, `/api/backup/uploads/${uploadId}/parts/${n}`);
      expect(res.status).toBe(200);
      parts.push(await res.json());
    }
    const other = await h.license();
    expect((await h.authed(`/api/backup/uploads/${uploadId}/complete`, other, { method: 'POST', body: JSON.stringify({ parts }) })).status).toBe(404);

    const done = await h.authed(`/api/backup/uploads/${uploadId}/complete`, token, { method: 'POST', body: JSON.stringify({ parts }) });
    expect(done.status).toBe(201);
    expect(await readJson(done)).toMatchObject({ size, previousKept: false });
    const back = new Uint8Array(await (await h.authed('/api/backup', token)).arrayBuffer());
    expect(back.length).toBe(size);
    expect(back.subarray(0, 4)).toEqual(data.subarray(0, 4));
    expect(back[size - 1]).toBe(4);
  });

  it('refuses a declared size over the cap and can abort', async () => {
    const h = await harness({ cloudConfig: { backupPartBytes: partBytes, backupMaxBytes: 6 * MiB } });
    const token = await h.license();
    const big = await h.authed('/api/backup/uploads', token, { method: 'POST', body: JSON.stringify({ size: 6 * MiB + 1 }) });
    expect(big.status).toBe(413);
    const ok = await h.authed('/api/backup/uploads', token, { method: 'POST', body: JSON.stringify({ size: 100 }) });
    const { uploadId } = (await ok.json()) as { uploadId: string };
    expect((await h.authed(`/api/backup/uploads/${uploadId}`, token, { method: 'DELETE' })).status).toBe(200);
    expect((await h.authed(`/api/backup/uploads/${uploadId}`, token, { method: 'DELETE' })).status).toBe(404);
  });
});
