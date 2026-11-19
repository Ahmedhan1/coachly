// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyHeadIcons, BRAND_CACHE_KEY, hideBootSplashWhenReady, parseBrandCache, readBrandCache, showBootSplash, writeBrandCache, type BrandCache } from './BootSplash';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const cache: BrandCache = { color: '#C81E3A', onColor: '#FFFFFF', logo: PNG, icon180: PNG, icon512: PNG, startup: { url: PNG, width: 1179, height: 2556, ratio: 3 } };

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
});

describe('brand cache', () => {
  it('round-trips and rejects anything that is not a PNG data URL or a hex colour', () => {
    writeBrandCache(cache);
    expect(readBrandCache()).toEqual(cache);
    expect(parseBrandCache(JSON.stringify({ ...cache, color: 'red' }))).toBeNull();
    expect(parseBrandCache(JSON.stringify({ ...cache, logo: 'javascript:alert(1)' }))?.logo).toBeNull();
    expect(parseBrandCache('{bad json')).toBeNull();
    localStorage.setItem(BRAND_CACHE_KEY, 'x');
    expect(readBrandCache()).toBeNull();
  });
});

describe('head icons', () => {
  it('sets apple-touch-icon and a launch image for this screen', () => {
    applyHeadIcons(cache);
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe(PNG);
    const startup = document.head.querySelector('link[rel="apple-touch-startup-image"]');
    expect(startup?.getAttribute('media')).toContain('(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)');
  });
});

describe('boot splash', () => {
  it('shows the logo on the brand colour and hides once the app renders', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    document.body.appendChild(root);
    showBootSplash(cache);
    const splash = document.getElementById('boot-splash')!;
    expect(splash.style.background).toContain('rgb(200, 30, 58)');
    expect(splash.querySelector('img')?.getAttribute('src')).toBe(PNG);
    hideBootSplashWhenReady(root, 'بيحمّل…');
    root.innerHTML = '<p>بيحمّل…</p>';
    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(1000);
      expect(document.getElementById('boot-splash')).not.toBeNull();
      root.innerHTML = '<main>home</main>';
      return Promise.resolve().then(() => {
        vi.advanceTimersByTime(2000);
        expect(document.getElementById('boot-splash')).toBeNull();
      });
    });
  });

  it('falls back to the app icon without a cache', () => {
    showBootSplash(null);
    expect(document.querySelector('#boot-splash img')?.getAttribute('src')).toBe('/icons/icon-512.png');
  });
});
