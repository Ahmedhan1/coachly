import { describe, expect, it } from 'vitest';
import { BRAND_ID, brandManifest, brandParam, parseBrandUpload, pngSize, startupMedia } from './brandIcon';

/** Minimal PNG header: signature + IHDR chunk with the given size (enough for pngSize). */
function fakePng(w: number, h: number, extra = 0): Uint8Array {
  const out = new Uint8Array(33 + extra);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  out.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const dv = new DataView(out.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return out;
}
const b64 = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const valid = () => ({
  color: '#F25C1F',
  icon180: b64(fakePng(180, 180)),
  icon512: b64(fakePng(512, 512)),
  logo: b64(fakePng(400, 200)),
  startup: { png: b64(fakePng(1170, 2532)), width: 1170, height: 2532, ratio: 3 },
});

describe('pngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(fakePng(180, 180))).toEqual({ width: 180, height: 180 });
  });
  it('rejects anything that is not a PNG', () => {
    const jpeg = new Uint8Array(40).fill(0xff);
    expect(pngSize(jpeg)).toBeNull();
    expect(pngSize(new Uint8Array(10))).toBeNull();
  });
});

describe('parseBrandUpload', () => {
  it('accepts a well-formed upload and normalises the colour', () => {
    const r = parseBrandUpload({ ...valid(), color: '#f25c1f' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.color).toBe('#F25C1F');
      expect(r.value.icon180.length).toBe(33);
      expect(r.value.startup?.width).toBe(1170);
    }
  });
  it('works without a launch image', () => {
    const r = parseBrandUpload({ ...valid(), startup: undefined });
    expect(r.ok && r.value.startup).toBeNull();
  });
  it('rejects wrong icon sizes', () => {
    expect(parseBrandUpload({ ...valid(), icon180: b64(fakePng(181, 180)) })).toEqual({ ok: false, error: 'icon180' });
    expect(parseBrandUpload({ ...valid(), icon512: b64(fakePng(512, 500)) })).toEqual({ ok: false, error: 'icon512' });
  });
  it('rejects a logo larger than 512 px or not a PNG', () => {
    expect(parseBrandUpload({ ...valid(), logo: b64(fakePng(600, 100)) })).toEqual({ ok: false, error: 'logo' });
    expect(parseBrandUpload({ ...valid(), logo: 'not base64 !!' })).toEqual({ ok: false, error: 'logo' });
  });
  it('rejects a bad colour', () => {
    expect(parseBrandUpload({ ...valid(), color: 'red' })).toEqual({ ok: false, error: 'color' });
  });
  it('rejects a launch image whose declared size does not match the PNG or is too big', () => {
    const v = valid();
    expect(parseBrandUpload({ ...v, startup: { ...v.startup, width: 1000 } })).toEqual({ ok: false, error: 'startup' });
    expect(parseBrandUpload({ ...v, startup: { png: b64(fakePng(5000, 9000)), width: 5000, height: 9000, ratio: 3 } })).toEqual({ ok: false, error: 'startup' });
  });
  it('rejects oversized files', () => {
    expect(parseBrandUpload({ ...valid(), icon180: b64(fakePng(180, 180, 200_000)) })).toEqual({ ok: false, error: 'icon180' });
  });
  it('rejects non-objects', () => {
    expect(parseBrandUpload(null)).toEqual({ ok: false, error: 'shape' });
    expect(parseBrandUpload('x')).toEqual({ ok: false, error: 'shape' });
  });
});

describe('brandParam', () => {
  it('reads a valid brand id from a query string', () => {
    expect(brandParam('?brand=0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
    expect(brandParam('?x=1&brand=0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
  });
  it('ignores anything else', () => {
    expect(brandParam('')).toBeNull();
    expect(brandParam('?brand=../../etc')).toBeNull();
    expect(brandParam('?brand=ABC')).toBeNull();
  });
  it('matches the id pattern', () => {
    expect(BRAND_ID.test('0123456789abcdef01234567')).toBe(true);
  });
});

describe('brandManifest', () => {
  it('starts the installed app with the brand id and uses the brand icons', () => {
    const m = brandManifest('0123456789abcdef01234567', '#123456');
    expect(m.start_url).toBe('/?brand=0123456789abcdef01234567');
    expect(m.id).toBe('/');
    expect(m.icons.map((i) => i.src)).toEqual([
      '/b/0123456789abcdef01234567/icon-180.png',
      '/b/0123456789abcdef01234567/icon-512.png',
    ]);
    expect(m.theme_color).toBe('#123456');
  });
});

describe('startupMedia', () => {
  it('builds the media query iOS matches launch images with', () => {
    expect(startupMedia(1170, 2532, 3)).toBe(
      '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    );
  });
});
