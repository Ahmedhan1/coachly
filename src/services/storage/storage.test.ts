import { describe, expect, it } from 'vitest';
import { BrowserStorageService } from './browserStorageService';
import { FakeImageDownscaler } from './fakeImageDownscaler';
import { FakeStorageService } from './fakeStorageService';
import { fitWithin } from './targetSize';

describe('fitWithin', () => {
  it('scales the longest side down to the max', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3024, 4032, 1200)).toEqual({ width: 900, height: 1200 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
  it('keeps at least 1px on extreme panoramas and rejects empty images', () => {
    expect(fitWithin(100_000, 10, 1200)).toEqual({ width: 1200, height: 1 });
    expect(() => fitWithin(0, 10, 1200)).toThrow(RangeError);
  });
});

const manager = (over: Partial<StorageManager>): StorageManager => over as StorageManager;

describe('BrowserStorageService', () => {
  it('reports unsupported without navigator.storage', async () => {
    const s = new BrowserStorageService(undefined);
    expect(await s.requestPersistence()).toBe('unsupported');
    expect(await s.estimate()).toBeNull();
    expect(await s.isPersisted()).toBe(false);
  });
  it('does not re-prompt when already persisted', async () => {
    let asked = 0;
    const s = new BrowserStorageService(
      manager({ persisted: async () => true, persist: async () => (asked++, true) }),
    );
    expect(await s.requestPersistence()).toBe('granted');
    expect(asked).toBe(0);
  });
  it('maps a refusal and a throw to denied', async () => {
    const refused = new BrowserStorageService(manager({ persisted: async () => false, persist: async () => false }));
    expect(await refused.requestPersistence()).toBe('denied');
    const throws = new BrowserStorageService(
      manager({ persisted: async () => false, persist: async () => Promise.reject(new Error('x')) }),
    );
    expect(await throws.requestPersistence()).toBe('denied');
  });
  it('returns usage and quota', async () => {
    const s = new BrowserStorageService(manager({ estimate: async () => ({ usage: 10, quota: 100 }) }));
    expect(await s.estimate()).toEqual({ usageBytes: 10, quotaBytes: 100 });
  });
});

describe('fakes', () => {
  it('FakeStorageService records requests', async () => {
    const f = new FakeStorageService();
    expect(await f.requestPersistence()).toBe('granted');
    expect(await f.isPersisted()).toBe(true);
    expect(f.requests).toBe(1);
  });
  it('FakeImageDownscaler returns the fitted size as JPEG', async () => {
    const out = await new FakeImageDownscaler().downscale(new Blob(['abc'], { type: 'image/png' }));
    expect(out).toMatchObject({ width: 1200, height: 900 });
    expect(out.blob.type).toBe('image/jpeg');
  });
});
