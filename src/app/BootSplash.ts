/**
 * Cold-start splash: the trainer's logo centred on the brand colour, shown before React renders and faded
 * out once the first real screen is up. Plain DOM (runs before React). The logo and colour come from a small
 * localStorage cache written whenever the identity changes (src/features/identity/brandAssets.ts); without
 * it the app icon is shown on the default colour. Every storage access is guarded (private mode, quota).
 */

export const BRAND_CACHE_KEY = 'pt.brandAssets.v1';

export interface BrandCache {
  /** Brand colour #RRGGBB. */
  color: string;
  /** Text colour on the brand colour. */
  onColor: string;
  /** The logo, ≤ 512 px, PNG data URL; null = no logo (app icon). */
  logo: string | null;
  /** Square home-screen icons (PNG data URLs) on the brand background. */
  icon180: string | null;
  icon512: string | null;
  /** Launch image for this phone's screen (portrait, device pixels). */
  startup: { url: string; width: number; height: number; ratio: number } | null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const isPng = (v: unknown): v is string => typeof v === 'string' && PNG.test(v);

export function parseBrandCache(raw: string | null): BrandCache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.color !== 'string' || !HEX.test(v.color) || typeof v.onColor !== 'string' || !HEX.test(v.onColor)) return null;
    const s = v.startup as Record<string, unknown> | null | undefined;
    const startup =
      s && isPng(s.url) && typeof s.width === 'number' && typeof s.height === 'number' && typeof s.ratio === 'number'
        ? { url: s.url, width: s.width, height: s.height, ratio: s.ratio }
        : null;
    return {
      color: v.color,
      onColor: v.onColor,
      logo: isPng(v.logo) ? v.logo : null,
      icon180: isPng(v.icon180) ? v.icon180 : null,
      icon512: isPng(v.icon512) ? v.icon512 : null,
      startup,
    };
  } catch {
    return null;
  }
}

export function readBrandCache(): BrandCache | null {
  try {
    return parseBrandCache(window.localStorage.getItem(BRAND_CACHE_KEY));
  } catch {
    return null;
  }
}

export function writeBrandCache(cache: BrandCache | null): void {
  try {
    if (cache) window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(cache));
    else window.localStorage.removeItem(BRAND_CACHE_KEY);
  } catch {
    // storage full or blocked: the splash falls back to the app icon
  }
}

function setLink(rel: string, href: string, attrs: Record<string, string> = {}): void {
  const sel = `link[rel="${rel}"]${attrs.media ? `[media="${attrs.media}"]` : ''}`;
  let link = document.head.querySelector<HTMLLinkElement>(sel);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
  link.href = href;
}

/**
 * Points the home-screen icon and launch image at the trainer's logo. iOS reads them when the app is added to
 * the home screen, so an existing icon changes only after re-adding (the app shows a one-time hint).
 */
export function applyHeadIcons(cache: BrandCache | null): void {
  if (!cache) return;
  if (cache.icon180) setLink('apple-touch-icon', cache.icon180, { sizes: '180x180' });
  if (cache.icon512) setLink('icon', cache.icon512, { type: 'image/png', sizes: '512x512' });
  if (cache.startup) {
    const { width, height, ratio } = cache.startup;
    const media = `(device-width: ${Math.round(width / ratio)}px) and (device-height: ${Math.round(height / ratio)}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
    setLink('apple-touch-startup-image', cache.startup.url, { media });
  }
}

const SPLASH_ID = 'boot-splash';
let shownAt = 0;

export function showBootSplash(cache: BrandCache | null, fallbackIcon = '/icons/icon-512.png'): void {
  if (document.getElementById(SPLASH_ID)) return;
  shownAt = performance.now();
  const el = document.createElement('div');
  el.id = SPLASH_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
    `background:${cache?.color ?? 'var(--bg, #ededea)'};transition:opacity 280ms ease-out;`;
  const img = document.createElement('img');
  img.alt = '';
  img.src = cache?.logo ?? cache?.icon512 ?? fallbackIcon;
  img.decoding = 'sync';
  // A logo on a transparent background sits on a white card so dark logos stay visible on dark brands.
  img.style.cssText = cache?.logo
    ? 'max-width:min(56vw,300px);max-height:34vh;object-fit:contain;background:#fff;border-radius:28px;padding:22px;box-shadow:0 18px 40px rgba(0,0,0,.18);'
    : 'width:min(36vw,180px);height:auto;border-radius:22%;';
  el.appendChild(img);
  document.body.appendChild(el);
}

/** Fades the splash out (instantly with prefers-reduced-motion), keeping it at least `minMs` on screen. */
export function hideBootSplash(minMs = 450): void {
  const el = document.getElementById(SPLASH_ID);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const wait = Math.max(0, minMs - (performance.now() - shownAt));
  window.setTimeout(() => {
    if (reduce) return el.remove();
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    window.setTimeout(() => el.remove(), 600);
  }, wait);
}

/**
 * Hides the splash when the app shows its first real screen: the first time #root holds something other
 * than the loading line. Gives up after `maxMs` so a slow database never traps the trainer behind it.
 */
export function hideBootSplashWhenReady(root: HTMLElement, loadingText: string, maxMs = 6000): void {
  const ready = () => root.childElementCount > 0 && root.textContent?.trim() !== loadingText;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    hideBootSplash();
  };
  const observer = new MutationObserver(() => ready() && finish());
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.setTimeout(finish, maxMs);
  if (ready()) finish();
}
