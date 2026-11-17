import { describe, expect, it, vi } from 'vitest';
import { sealWithPassword } from '../../../shared/envelope';
import { FILE_PASSWORD_KEY, memoryBackupMetaStore } from '@/data/backupMeta';
import type { ShareFileRequest, ShareResult, ShareService } from '@/services/share';
import { openChunked, PTB1_HEADER_BYTES, sealChunked } from './chunkedEnvelope';
import { BrowserDeviceFileSaver, type FileHandleLike, type SavePicker } from './deviceFileSaver';
import { exportArchive } from './exporter';
import { importArchive } from './importer';
import { LocalBackupService } from './localBackupService';
import { dumpDatabase, seedDatabase, seededBytes, testDbFactory } from './testFixtures';

const NOW = new Date('2026-11-17T10:00:00Z');
const ITER = 100_000;
const KB = 1024;
const MB = 1024 * KB;

describe('PTB1 chunked envelope', () => {
  const plain = new Blob([seededBytes(10_000, 7) as BlobPart]);

  it('round-trips across many chunks and an exact multiple of the chunk size', async () => {
    for (const size of [0, 1, 4096, 10_000]) {
      const data = new Blob([seededBytes(size, 3) as BlobPart]);
      const sealed = await sealChunked(data, 'كلمة-سر-طويلة', { iterations: ITER, chunkBytes: 1024 });
      const opened = await openChunked(sealed, 'كلمة-سر-طويلة');
      expect(opened.ok).toBe(true);
      if (opened.ok) expect(new Uint8Array(await opened.value.arrayBuffer())).toEqual(new Uint8Array(await data.arrayBuffer()));
    }
  });

  it('wrong password, flipped byte, dropped or swapped chunk are all refused', async () => {
    const sealed = await sealChunked(plain, 'password1', { iterations: ITER, chunkBytes: 1024 });
    expect(await openChunked(sealed, 'password2')).toEqual({ ok: false, error: 'wrong_password' });
    const bytes = new Uint8Array(await sealed.arrayBuffer());
    const flipped = bytes.slice();
    flipped[PTB1_HEADER_BYTES + 40] = flipped[PTB1_HEADER_BYTES + 40]! ^ 1;
    expect(await openChunked(new Blob([flipped]), 'password1')).toEqual({ ok: false, error: 'malformed' });
    const chunk = 12 + 1024 + 16;
    const truncated = bytes.slice(0, bytes.length - chunk);
    expect((await openChunked(new Blob([truncated]), 'password1')).ok).toBe(false);
    const swapped = bytes.slice();
    swapped.set(bytes.subarray(PTB1_HEADER_BYTES + chunk, PTB1_HEADER_BYTES + 2 * chunk), PTB1_HEADER_BYTES);
    swapped.set(bytes.subarray(PTB1_HEADER_BYTES, PTB1_HEADER_BYTES + chunk), PTB1_HEADER_BYTES + chunk);
    expect(await openChunked(new Blob([swapped]), 'password1')).toEqual({ ok: false, error: 'malformed' });
    const tamperedHeader = bytes.slice();
    tamperedHeader[45] = tamperedHeader[45]! ^ 1; // fileId: wrapped key no longer opens
    expect((await openChunked(new Blob([tamperedHeader]), 'password1')).ok).toBe(false);
  });
});

describe('device backup file', () => {
  it('300 photos: encrypted export never hands Web Crypto more than one chunk, and restores byte-identical', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source, { images: 300, imageBytes: 64 * KB });
    const chunkBytes = 1 * MB;
    const service = new LocalBackupService({ db: source, meta: memoryBackupMetaStore(), appVersion: '1', now: () => NOW, iterations: ITER, chunkBytes });

    const encrypt = vi.spyOn(crypto.subtle, 'encrypt');
    let largestJsBuffer = 0;
    const realArrayBuffer = Blob.prototype.arrayBuffer;
    const spyBuf = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      largestJsBuffer = Math.max(largestJsBuffer, this.size);
      return realArrayBuffer.call(this);
    });
    const heapBefore = process.memoryUsage().heapUsed;
    const r = await service.exportFile({ password: 'long-password' });
    const heapAfter = process.memoryUsage().heapUsed;
    spyBuf.mockRestore();
    const sizes = encrypt.mock.calls.map((c) => (c[2] as Uint8Array).byteLength);
    encrypt.mockRestore();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.blob.size).toBeGreaterThan(300 * 64 * KB);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(chunkBytes);
    // The whole ~19 MB backup was never read into one JS buffer (only single photos and single chunks).
    expect(largestJsBuffer).toBeLessThanOrEqual(chunkBytes);
    // Informational: JS heap growth stays well under the file size (Blob parts live outside the JS heap in browsers).
    console.info(`300 photos: file ${(r.value.blob.size / MB).toFixed(1)} MB, heap delta ${((heapAfter - heapBefore) / MB).toFixed(1)} MB, largest buffer ${(largestJsBuffer / KB).toFixed(0)} KB`);

    const target = f.open();
    const restore = new LocalBackupService({ db: target, meta: memoryBackupMetaStore(), appVersion: '1', now: () => NOW });
    expect(await restore.detectFile(r.value.blob)).toBe('encrypted');
    const imported = await restore.importFile(r.value.blob, { password: 'long-password' });
    expect(imported.ok).toBe(true);
    expect(await dumpDatabase(target)).toEqual(await dumpDatabase(source));
  }, 60_000);

  it('older single-message PTP1 files still restore', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    const zip = await exportArchive(source, { appVersion: '1', now: NOW });
    if (!zip.ok) throw new Error(zip.error);
    const old = new Blob([(await sealWithPassword('old-password', new Uint8Array(await zip.value.blob.arrayBuffer()), ITER)) as BlobPart]);
    const target = f.open();
    const restore = new LocalBackupService({ db: target, meta: memoryBackupMetaStore(), appVersion: '1', now: () => NOW });
    expect((await restore.importFile(old, { password: 'old-password' })).ok).toBe(true);
    expect(await dumpDatabase(target)).toEqual(await dumpDatabase(source));
  });

  it('never carries device-local secrets (license.*, backup.* incl. passwords) and a restore keeps this device’s', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source);
    await source.meta.bulkPut([
      { key: 'license.dataKey', value: 'SECRET-DATAKEY' },
      { key: 'backup.cloudPassword', value: 'SECRET-CLOUDPW' },
      { key: FILE_PASSWORD_KEY, value: 'SECRET-FILEPW' },
      { key: 'backup.status', value: { lastLocalAt: 1 } },
    ]);
    const zip = await exportArchive(source, { appVersion: '1', now: NOW });
    if (!zip.ok) throw new Error(zip.error);
    const { unzipSync } = await import('fflate');
    const files = unzipSync(new Uint8Array(await zip.value.blob.arrayBuffer()));
    const all = Object.values(files).map((b) => new TextDecoder().decode(b)).join('\n');
    for (const secret of ['SECRET-DATAKEY', 'SECRET-CLOUDPW', 'SECRET-FILEPW', 'backup.status', 'device-a-token']) expect(all.includes(secret)).toBe(false);

    const target = f.open();
    await target.meta.put({ key: FILE_PASSWORD_KEY, value: 'mine' });
    expect((await importArchive(target, zip.value.blob)).ok).toBe(true);
    expect((await target.meta.get(FILE_PASSWORD_KEY))?.value).toBe('mine');
  });

  it('records a save with route and size, clears the snooze, and stamps first use once', async () => {
    const meta = memoryBackupMetaStore({ reminderSnoozedUntil: 5 });
    let now = NOW;
    const service = new LocalBackupService({ db: testDbFactory().open(), meta, appVersion: '1', now: () => now });
    expect((await service.status()).firstUseAt).toBe(NOW.getTime());
    now = new Date(NOW.getTime() + 1000);
    expect((await service.status()).firstUseAt).toBe(NOW.getTime());
    await service.recordSaved(42, { bytes: 9, how: 'shared' });
    expect(await meta.get()).toMatchObject({ lastLocalAt: 42, lastLocalBytes: 9, lastLocalHow: 'shared', reminderSnoozedUntil: null });
  });
});

class ScriptedShare implements ShareService {
  calls: string[] = [];
  constructor(
    private readonly canShare: boolean,
    private readonly result: ShareResult,
  ) {}
  canShareFiles(): boolean {
    return this.canShare;
  }
  async shareFile(_r: ShareFileRequest, o: { prefer?: 'share' | 'download' } = {}): Promise<ShareResult> {
    this.calls.push(o.prefer ?? 'share');
    return o.prefer === 'download' ? { outcome: 'downloaded', fileName: _r.fileName } : this.result;
  }
}

describe('BrowserDeviceFileSaver', () => {
  const req = { blob: new Blob(['x']), fileName: 'pt-coach-backup-2026-11-17-1000.ptbackup', mimeType: 'application/octet-stream' };

  it('prefers the share sheet (iOS «حفظ في الملفات» / WhatsApp to self)', async () => {
    const share = new ScriptedShare(true, { outcome: 'shared' });
    expect(await new BrowserDeviceFileSaver(share, undefined).save(req)).toEqual({ outcome: 'shared' });
    expect(await new BrowserDeviceFileSaver(new ScriptedShare(true, { outcome: 'cancelled' }), undefined).save(req)).toEqual({ outcome: 'cancelled' });
    expect(await new BrowserDeviceFileSaver(new ScriptedShare(true, { outcome: 'failed', reason: 'not_allowed' }), undefined).save(req)).toEqual({
      outcome: 'failed',
      failure: 'not_allowed',
    });
  });

  it('uses the save picker when files cannot be shared, and reports saved only after close()', async () => {
    const written: Blob[] = [];
    let closed = false;
    const picker: SavePicker = async (o) => {
      expect(o.suggestedName).toBe(req.fileName);
      expect(o.types?.[0]?.accept).toEqual({ 'application/octet-stream': ['.ptbackup'] });
      const handle: FileHandleLike = {
        createWritable: async () => ({ write: async (b) => void written.push(b), close: async () => void (closed = true) }),
      };
      return handle;
    };
    expect(await new BrowserDeviceFileSaver(new ScriptedShare(false, { outcome: 'shared' }), picker).save(req)).toEqual({ outcome: 'saved' });
    expect(closed).toBe(true);
    expect(written[0]).toBe(req.blob);
  });

  it('picker cancel → cancelled; picker error → download fallback; nothing → download', async () => {
    const cancel: SavePicker = async () => Promise.reject(new DOMException('x', 'AbortError'));
    expect(await new BrowserDeviceFileSaver(new ScriptedShare(false, { outcome: 'shared' }), cancel).save(req)).toEqual({ outcome: 'cancelled' });
    const broken: SavePicker = async () => ({
      createWritable: async () => ({ write: async () => Promise.reject(new Error('disk')), close: async () => undefined, abort: async () => undefined }),
    });
    const share = new ScriptedShare(false, { outcome: 'shared' });
    expect(await new BrowserDeviceFileSaver(share, broken).save(req)).toEqual({ outcome: 'downloaded' });
    expect(share.calls).toEqual(['download']);
    expect(await new BrowserDeviceFileSaver(new ScriptedShare(false, { outcome: 'shared' }), undefined).save(req)).toEqual({ outcome: 'downloaded' });
  });
});
