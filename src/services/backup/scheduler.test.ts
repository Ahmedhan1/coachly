import { describe, expect, it } from 'vitest';
import { buildManifest, type ImageVariant } from '@/domain/backup';
import { ok } from '@/domain/nutrition/result';
import { memoryBackupMetaStore } from '@/data/backupMeta';
import { FakeCloudBackupClient } from '@/services/cloud/fakeCloudBackupClient';
import { FakeNetworkStatus, staticTokenProvider } from '@/services/cloud/networkStatus';
import { CloudRestoreService } from './cloudRestore';
import { exportArchive } from './exporter';
import { importArchive } from './importer';
import { BackupScheduler, memoryPasswordProvider, type BackupSchedulerDeps, type Timers } from './scheduler';
import { dumpDatabase, seedDatabase, ShrinkingDownscaler, testDbFactory } from './testFixtures';

const MIN = 60_000;

function manualTimers(start = 1_763_280_000_000) {
  let now = start;
  let seq = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      tasks.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => {
      tasks.delete(h as number);
    },
  };
  return {
    timers,
    now: () => now,
    pending: () => tasks.size,
    async advance(ms: number, settle: () => Promise<void>) {
      const target = now + ms;
      for (;;) {
        const due = [...tasks.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        tasks.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await settle();
      }
      now = target;
    },
  };
}

const sizes: Record<ImageVariant, number> = { full: 30_000_000, thumbnail: 6_000_000, none: 200_000 };

function setup(patch: Partial<BackupSchedulerDeps> = {}, opts: { online?: boolean; sizes?: Record<ImageVariant, number> } = {}) {
  const t = manualTimers();
  const client = new FakeCloudBackupClient(t.now);
  const network = new FakeNetworkStatus(opts.online ?? true);
  const meta = memoryBackupMetaStore();
  const exported: ImageVariant[] = [];
  const s = opts.sizes ?? sizes;
  const scheduler = new BackupScheduler({
    exportArchive: async (variant) => {
      exported.push(variant);
      const manifest = buildManifest({ appVersion: 't', schemaVersion: 1, createdAt: t.now(), imageVariant: variant, counts: {}, files: [] });
      return ok({ blob: new Blob([new Uint8Array(s[variant])]), manifest, skippedImages: 0 });
    },
    estimate: async () => ({ dataBytes: 200_000, imageCount: 10, fullImageBytes: 5_000_000 }),
    client,
    tokens: staticTokenProvider('tok'),
    passwords: memoryPasswordProvider('backup-password'),
    meta,
    network,
    timers: t.timers,
    now: t.now,
    seal: async (_p, d) => d,
    ...patch,
  });
  const settle = async () => {
    await scheduler.whenIdle();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { t, client, network, meta, scheduler, exported, settle };
}

describe('BackupScheduler', () => {
  it('debounces several changes into one upload and records the success time', async () => {
    const { t, client, meta, scheduler, settle } = setup();
    await scheduler.start();
    scheduler.notifyChange();
    await t.advance(MIN, settle);
    scheduler.notifyChange();
    await t.advance(MIN, settle);
    expect(client.calls).toHaveLength(0);
    expect(scheduler.getState().phase).toBe('scheduled');
    await t.advance(2 * MIN, settle);
    expect(client.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    const status = await meta.get();
    expect(status.lastCloudAt).toBe(t.now() - MIN);
    expect(status.dirtySince).toBeNull();
    expect(scheduler.getState()).toMatchObject({ phase: 'idle', dirty: false, lastError: null });
  });

  it('offline: waits, then uploads when the network comes back', async () => {
    const { t, client, network, scheduler, settle } = setup({}, { online: false });
    await scheduler.start();
    scheduler.notifyChange();
    await t.advance(3 * MIN, settle);
    expect(scheduler.getState()).toMatchObject({ phase: 'waiting_online', lastError: 'offline' });
    expect(client.calls).toHaveLength(0);
    network.setOnline(true);
    expect(scheduler.getState().phase).toBe('scheduled');
    await t.advance(MIN, settle);
    expect(client.stored).not.toBeNull();
    expect(scheduler.getState().phase).toBe('idle');
  });

  it('timeout: queues a retry with backoff, then succeeds', async () => {
    const { t, client, scheduler, settle } = setup();
    client.failNext('timeout', 'network');
    const first = await scheduler.runNow();
    await settle();
    expect(first).toEqual({ ok: false, error: 'timeout' });
    expect(scheduler.getState()).toMatchObject({ phase: 'retry_wait', attempt: 1, nextAttemptAt: t.now() + MIN });
    await t.advance(MIN, settle);
    expect(scheduler.getState()).toMatchObject({ phase: 'retry_wait', attempt: 2, lastError: 'network', nextAttemptAt: t.now() + 5 * MIN });
    await t.advance(5 * MIN, settle);
    expect(scheduler.getState()).toMatchObject({ phase: 'idle', attempt: 0, lastError: null });
    expect(client.stored).not.toBeNull();
  });

  it('storage_full: lowers the photo variant and retries with less', async () => {
    const { t, client, meta, scheduler, exported, settle } = setup({}, { sizes: { full: 1_000_000, thumbnail: 300_000, none: 50_000 } });
    client.failNext('storage_full');
    expect(await scheduler.runNow()).toEqual({ ok: false, error: 'storage_full' });
    await settle();
    expect((await meta.get()).cloudCeiling).toBe('thumbnail');
    await t.advance(0, settle);
    expect(exported).toEqual(['full', 'thumbnail']);
    const status = await meta.get();
    expect(status.lastCloudVariant).toBe('thumbnail');
    expect(status.lastCloudBytes).toBe(300_000);
  });

  it('storage_full with data only: stops and waits for the trainer', async () => {
    const { client, meta, scheduler, settle, t } = setup();
    await meta.update({ cloudCeiling: 'none' });
    client.failNext('storage_full');
    await scheduler.runNow();
    await settle();
    expect(scheduler.getState()).toMatchObject({ phase: 'idle', lastError: 'storage_full' });
    expect(t.pending()).toBe(0);
    expect((await meta.get()).lastCloudError).toBe('storage_full');
  });

  it('chooses thumbnails when the full archive is over budget', async () => {
    const { client, scheduler, exported } = setup({
      estimate: async () => ({ dataBytes: 1_000_000, imageCount: 200, fullImageBytes: 40_000_000 }),
    });
    const r = await scheduler.runNow();
    expect(r.ok && r.value.variant).toBe('thumbnail');
    expect(exported).toEqual(['thumbnail']);
    expect(client.calls[0]?.bytes).toBe(6_000_000);
  });

  it('falls back to a smaller variant when the real archive is still over budget', async () => {
    const { scheduler, exported } = setup({}, { sizes: { full: 30_000_000, thumbnail: 25_000_000, none: 100 } });
    const r = await scheduler.runNow();
    expect(exported).toEqual(['full', 'thumbnail', 'none']);
    expect(r.ok && r.value.variant).toBe('none');
  });

  it('missing password or license: no upload, no retry loop', async () => {
    const a = setup({ passwords: memoryPasswordProvider(null) });
    expect(await a.scheduler.runNow()).toEqual({ ok: false, error: 'needs_password' });
    await a.settle();
    expect(a.t.pending()).toBe(0);
    const b = setup({ tokens: staticTokenProvider(null) });
    expect(await b.scheduler.runNow()).toEqual({ ok: false, error: 'not_activated' });
    expect(b.client.calls).toHaveLength(0);
  });

  it('respects the minimum interval between uploads', async () => {
    const { t, client, scheduler, settle } = setup();
    await scheduler.runNow();
    await settle();
    scheduler.notifyChange();
    await t.advance(10 * MIN, settle);
    expect(client.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await t.advance(6 * 60 * MIN, settle);
    expect(client.calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  });

  it('resumes a pending backup after restart', async () => {
    const first = setup();
    await first.meta.update({ dirtySince: 1 });
    await first.scheduler.start();
    expect(first.scheduler.getState()).toMatchObject({ dirty: true, phase: 'scheduled' });
    await first.t.advance(2 * MIN, first.settle);
    expect(first.client.stored).not.toBeNull();
  });

  it('a throwing exporter is reported, not thrown', async () => {
    const { scheduler } = setup({ exportArchive: async () => Promise.reject(new Error('boom')) });
    expect(await scheduler.runNow()).toEqual({ ok: false, error: 'unexpected' });
  });
});

describe('cloud backup end to end (real export + PTP1 + fake server)', () => {
  it('uploads an encrypted thumbnail copy and restores it on a new device', async () => {
    const f = testDbFactory();
    const source = f.open();
    await seedDatabase(source, { images: 4, imageBytes: 50_000 });
    const t = manualTimers();
    const client = new FakeCloudBackupClient(t.now);
    const scheduler = new BackupScheduler({
      exportArchive: (variant) =>
        exportArchive(source, { appVersion: 't', now: new Date(t.now()), imageVariant: variant, downscaler: new ShrinkingDownscaler() }),
      estimate: async () => ({ dataBytes: 1000, imageCount: 4, fullImageBytes: 200_000 }),
      client,
      tokens: staticTokenProvider('tok'),
      passwords: memoryPasswordProvider('backup-password'),
      meta: memoryBackupMetaStore(),
      network: new FakeNetworkStatus(true),
      timers: t.timers,
      now: t.now,
      config: { budgetBytes: 150_000 },
    });
    const up = await scheduler.runNow();
    expect(up.ok && up.value.variant).toBe('thumbnail');
    expect(new TextDecoder().decode(client.stored!.slice(0, 4))).toBe('PTP1');

    const target = f.open();
    const restore = new CloudRestoreService({
      client,
      tokens: staticTokenProvider('tok'),
      importZip: (zip, o) => importArchive(target, zip, o),
    });
    expect(await restore.restore('wrong-password')).toEqual({ ok: false, error: 'wrong_password' });
    const r = await restore.restore('backup-password');
    expect(r.ok && r.value.imageVariant).toBe('thumbnail');
    const src = await dumpDatabase(source);
    const dst = await dumpDatabase(target);
    expect(dst.clients).toEqual(src.clients);
    expect(dst.images).toHaveLength(4);
    const info = await restore.info();
    expect(info.ok && info.value?.bytes).toBe(client.stored!.length);
  }, 30_000);
});
