import { describe, expect, it } from 'vitest';
import {
  buildStorageReport,
  bytesPerClient,
  categoryForSource,
  collectImageRefs,
  DEFAULT_BYTES_PER_CLIENT,
  estimateClientCapacity,
  friendlyFloor,
  ORPHAN_GRACE_MS,
  storagePressure,
  type StorageCategory,
  type StoredImageInfo,
} from './storage';
import { latestBackup } from './versions';

const MB = 1024 * 1024;
const now = new Date('2026-11-17T10:00:00Z');
const img = (id: string, bytes: number, extra: Partial<StoredImageInfo> = {}): StoredImageInfo => ({
  id,
  bytes,
  mime: 'image/jpeg',
  width: 1200,
  height: 900,
  createdAt: now.getTime() - 10 * ORPHAN_GRACE_MS,
  ...extra,
});

describe('collectImageRefs', () => {
  it('finds ids at any depth in plain rows and ignores other strings', () => {
    const ids = new Set(['a', 'b', 'c', 'd']);
    const found = new Set<string>();
    collectImageRefs({ photoId: 'a', name: 'x', nested: { list: [{ imageId: 'b' }, 'zz'] }, n: 4, arr: [['c']] }, ids, found);
    expect([...found].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('categoryForSource', () => {
  it('maps tables and meta keys to categories', () => {
    expect(categoryForSource('progress')).toBe('clientPhotos');
    expect(categoryForSource('clients')).toBe('clientPhotos');
    expect(categoryForSource('exercises')).toBe('exercisePhotos');
    expect(categoryForSource('recipes')).toBe('foodPhotos');
    expect(categoryForSource('settings')).toBe('branding');
    expect(categoryForSource('meta', 'progress.photos.e1')).toBe('clientPhotos');
    expect(categoryForSource('meta', 'nutrition.ingredients')).toBe('foodPhotos');
    expect(categoryForSource('meta', 'whatever')).toBe('other');
    expect(categoryForSource('somethingNew')).toBe('other');
  });
});

describe('buildStorageReport', () => {
  it('sums by owner, offers old unreferenced photos and big JPEGs, never transparent PNGs or fresh orphans', () => {
    const owners = new Map<string, StorageCategory>([
      ['p1', 'clientPhotos'],
      ['big', 'clientPhotos'],
      ['logo', 'branding'],
      ['ex', 'exercisePhotos'],
    ]);
    const report = buildStorageReport(
      [
        img('p1', 200_000),
        img('big', 3 * MB, { width: 4032, height: 3024 }),
        img('logo', 900_000, { mime: 'image/png', width: 2000, height: 2000 }),
        img('ex', 100_000),
        img('old-orphan', 50_000),
        img('new-orphan', 70_000, { createdAt: now.getTime() - 1000 }),
      ],
      owners,
      now,
    );
    expect(report.byCategory.clientPhotos).toEqual({ count: 2, bytes: 200_000 + 3 * MB });
    expect(report.byCategory.branding.bytes).toBe(900_000);
    expect(report.byCategory.other).toEqual({ count: 2, bytes: 120_000 });
    expect(report.unused).toEqual({ ids: ['old-orphan'], bytes: 50_000 });
    expect(report.oversized).toEqual({ ids: ['big'], bytes: 3 * MB });
    expect(report.imageBytes).toBe(200_000 + 3 * MB + 900_000 + 100_000 + 120_000);
  });
});

describe('capacity', () => {
  it('uses a default per client until there are 3 clients, then measures', () => {
    expect(bytesPerClient({ clientCount: 1, clientPhotoBytes: 50 * MB })).toBe(DEFAULT_BYTES_PER_CLIENT);
    expect(bytesPerClient({ clientCount: 4, clientPhotoBytes: 8 * MB })).toBe(2 * MB + 100 * 1024);
    expect(bytesPerClient({ clientCount: 10, clientPhotoBytes: 0 })).toBe(300 * 1024);
  });

  it('estimates clients that fit in the free space with a safety margin, rounded down', () => {
    // 2.1 GB quota, 13 MB used, default 3 MB per client → (0.9*2150 − 13) / 3 ≈ 640.
    const n = estimateClientCapacity({ quotaBytes: 2150 * MB, usageBytes: 13 * MB, clientCount: 0, clientPhotoBytes: 0 });
    expect(n).toBe(640);
    expect(estimateClientCapacity({ quotaBytes: 100 * MB, usageBytes: 95 * MB, clientCount: 0, clientPhotoBytes: 0 })).toBe(0);
    expect(estimateClientCapacity({ quotaBytes: 0, usageBytes: 0, clientCount: 0, clientPhotoBytes: 0 })).toBeNull();
  });

  it('rounds to friendly numbers', () => {
    expect(friendlyFloor(7)).toBe(7);
    expect(friendlyFloor(347)).toBe(340);
    expect(friendlyFloor(4321)).toBe(4300);
    expect(friendlyFloor(54_321)).toBe(54_000);
  });

  it('rates storage pressure', () => {
    expect(storagePressure(100, 10)).toBe('ok');
    expect(storagePressure(100, 75)).toBe('high');
    expect(storagePressure(100, 95)).toBe('critical');
    expect(storagePressure(0, 95)).toBe('ok');
  });
});

describe('latest backup', () => {
  it('picks the latest backup of any kind', () => {
    expect(latestBackup({ lastLocalAt: null, lastCloudAt: null })).toBeNull();
    expect(latestBackup({ lastLocalAt: 5, lastCloudAt: 9 })).toEqual({ at: 9, place: 'cloud' });
    expect(latestBackup({ lastLocalAt: 70, lastCloudAt: null })).toEqual({ at: 70, place: 'local' });
  });
});
