import type { AppServices } from '@/app/services';
import { readBrandCache } from '@/app/pwa/BootSplash';
import type { BrandHosting, BrandIconSet, BrandUploadFailure } from '@/services/brand/brandHosting';
import { BRAND_LIMITS, brandParam, brandPath, startupMedia } from '../../../shared/brandIcon';
import { buildBrandCache, dataUrlBytes, refreshBrandAssets } from './brandAssets';

/** Meta key: the hosted brand id already copied into this app's settings (so a removed logo stays removed). */
export const BRAND_IMPORTED_KEY = 'identity.brandImported';
const LOGO_MAX_SIDE = 512;

function setLink(rel: string, href: string, attrs: Record<string, string> = {}): void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
  link.href = href;
}

/**
 * Points this page's home-screen icon, manifest and launch image at a hosted brand, and puts `?brand=<id>` in
 * the address, so "Add to Home Screen" takes the trainer's logo and the installed app learns the brand.
 */
export function applyHostedBrand(id: string, startup: { width: number; height: number; ratio: number } | null): void {
  setLink('apple-touch-icon', brandPath(id, 'icon-180.png'), { sizes: '180x180' });
  setLink('icon', brandPath(id, 'icon-512.png'), { type: 'image/png', sizes: '512x512' });
  setLink('manifest', brandPath(id, 'manifest.webmanifest'));
  if (startup) setLink('apple-touch-startup-image', brandPath(id, 'startup.png'), { media: startupMedia(startup.width, startup.height, startup.ratio) });
  const url = new URL(window.location.href);
  url.searchParams.set('brand', id);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * The upload body from a built cache, inside the server's caps (shared/brandIcon BRAND_LIMITS): a launch image
 * that is too large is left out (the icon still works) rather than having the whole upload refused.
 */
export function iconSetFrom(cache: Awaited<ReturnType<typeof buildBrandCache>>): BrandIconSet | null {
  if (!cache.icon180 || !cache.icon512 || !cache.logo) return null;
  if (dataUrlBytes(cache.icon180) > BRAND_LIMITS.icon180 || dataUrlBytes(cache.icon512) > BRAND_LIMITS.icon512 || dataUrlBytes(cache.logo) > BRAND_LIMITS.logo) return null;
  const startup = cache.startup && dataUrlBytes(cache.startup.url) <= BRAND_LIMITS.startup ? cache.startup : null;
  return { color: cache.color, icon180: cache.icon180, icon512: cache.icon512, logo: cache.logo, startup };
}

export type HostLogoResult =
  | { ok: true; id: string; preview: string; startup: { width: number; height: number; ratio: number } | null }
  | { ok: false; reason: BrandUploadFailure | 'image' };

/** Install page: builds the icon set from a picked logo and uploads it. Never throws. */
export async function hostLogo(hosting: BrandHosting, color: string, logo: Blob): Promise<HostLogoResult> {
  const cache = await buildBrandCache(color, logo).catch(() => null);
  const set = cache && iconSetFrom(cache);
  if (!set) return { ok: false, reason: 'image' };
  const up = await hosting.upload(set).catch(() => ({ ok: false as const, reason: 'unavailable' as const }));
  if (!up.ok) return up;
  const startup = set.startup ? { width: set.startup.width, height: set.startup.height, ratio: set.startup.ratio } : null;
  return { ok: true, id: up.id, preview: set.icon180, startup };
}

/** Inside the installed app: uploads the current logo's icon set (for a "re-add with the new icon" link). */
export async function hostCurrentBrand(services: Pick<AppServices, 'data'>, hosting: BrandHosting): Promise<string | null> {
  await refreshBrandAssets(services);
  const cache = readBrandCache();
  const set = cache && iconSetFrom(cache);
  if (!set) return null;
  const up = await hosting.upload(set);
  return up.ok ? up.id : null;
}

/**
 * First launch of an app installed from a branded install page (`/?brand=<id>`): copies the hosted logo and
 * colour into the settings unless the trainer already has a logo or this brand was imported before.
 * Never throws; returns true when the identity changed.
 */
export async function importHostedBrand(services: Pick<AppServices, 'data' | 'meta' | 'images'>, hosting: BrandHosting, search: string): Promise<boolean> {
  const id = brandParam(search);
  if (!id) return false;
  try {
    if ((await services.meta.get(BRAND_IMPORTED_KEY)) === id) return false;
    const settings = await services.data.repos.settings.get();
    if (settings.logoImageId) {
      await services.meta.set(BRAND_IMPORTED_KEY, id);
      return false;
    }
    const [info, logo] = await Promise.all([hosting.info(id), hosting.logo(id)]);
    if (!info || !logo) return false;
    const small = await services.images.downscale(logo, LOGO_MAX_SIDE);
    const saved = await services.data.repos.images.save(small);
    await services.data.repos.settings.update({ logoImageId: saved.id, primaryColor: info.color });
    await services.meta.set(BRAND_IMPORTED_KEY, id);
    await refreshBrandAssets(services).catch(() => false);
    return true;
  } catch {
    return false;
  }
}
