import { describe, expect, it } from 'vitest';
import { createTestData } from '@/data/testing';
import { FakeBrandHosting } from '@/services/brand/brandHosting';
import { FakeImageDownscaler } from '@/services/storage/fakeImageDownscaler';
import { BRAND_IMPORTED_KEY, hostLogo, iconSetFrom, importHostedBrand } from './hostedBrand';

const ID = '0123456789abcdef01234567';

function setup() {
  const { repos } = createTestData();
  const store = new Map<string, unknown>();
  const meta = { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
  const hosting = new FakeBrandHosting(new Map([[ID, { color: '#123ABC', logo: new Blob(['png'], { type: 'image/png' }) }]]));
  const services = { data: { repos }, meta, images: new FakeImageDownscaler({ width: 300, height: 300 }) } as never;
  return { repos, store, hosting, services };
}

describe('importHostedBrand', () => {
  it('copies the hosted logo and colour into the settings on first launch', async () => {
    const { repos, store, hosting, services } = setup();
    expect(await importHostedBrand(services, hosting, `?brand=${ID}`)).toBe(true);
    const s = await repos.settings.get();
    expect(s.logoImageId).not.toBeNull();
    expect(s.primaryColor).toBe('#123ABC');
    expect(store.get(BRAND_IMPORTED_KEY)).toBe(ID);
  });

  it('runs once: a logo the trainer removed later is not brought back', async () => {
    const { repos, hosting, services } = setup();
    await importHostedBrand(services, hosting, `?brand=${ID}`);
    await repos.settings.update({ logoImageId: null });
    expect(await importHostedBrand(services, hosting, `?brand=${ID}`)).toBe(false);
    expect((await repos.settings.get()).logoImageId).toBeNull();
  });

  it('never replaces a logo the trainer already has', async () => {
    const { repos, hosting, services } = setup();
    const own = await repos.images.save({ blob: new Blob(['x'], { type: 'image/png' }), width: 10, height: 10 });
    await repos.settings.update({ logoImageId: own.id });
    expect(await importHostedBrand(services, hosting, `?brand=${ID}`)).toBe(false);
    expect((await repos.settings.get()).logoImageId).toBe(own.id);
  });

  it('does nothing without a valid brand id or when the brand is unknown', async () => {
    const { repos, hosting, services } = setup();
    expect(await importHostedBrand(services, hosting, '')).toBe(false);
    expect(await importHostedBrand(services, hosting, '?brand=nope')).toBe(false);
    expect(await importHostedBrand(services, hosting, '?brand=ffffffffffffffffffffffff')).toBe(false);
    expect((await repos.settings.get()).logoImageId).toBeNull();
  });
});

const png = (bytes: number) => `data:image/png;base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
const cache = { color: '#123ABC', onColor: '#FFFFFF', logo: png(10), icon180: png(10), icon512: png(10), startup: { url: png(10), width: 1, height: 2, ratio: 3 } };

describe('iconSetFrom', () => {
  it('keeps a set inside the server caps', () => {
    expect(iconSetFrom(cache)?.startup).toEqual(cache.startup);
  });

  it('leaves out a launch image that is too large instead of having the whole upload refused', () => {
    const set = iconSetFrom({ ...cache, startup: { ...cache.startup, url: png(1_600_000) } });
    expect(set).not.toBeNull();
    expect(set?.startup).toBeNull();
  });

  it('is null when an icon or the logo is over its cap or missing', () => {
    expect(iconSetFrom({ ...cache, logo: png(700_000) })).toBeNull();
    expect(iconSetFrom({ ...cache, icon180: png(200_000) })).toBeNull();
    expect(iconSetFrom({ ...cache, icon512: null })).toBeNull();
  });
});

describe('hostLogo', () => {
  it('reports a picture that cannot be drawn as an image problem, without uploading', async () => {
    const { hosting } = setup();
    expect(await hostLogo(hosting, '#123ABC', new Blob(['not a picture'], { type: 'image/png' }))).toEqual({ ok: false, reason: 'image' });
    expect(hosting.uploads).toHaveLength(0);
  });
});
