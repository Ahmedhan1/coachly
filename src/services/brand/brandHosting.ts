import { brandPath, BRAND_ID } from '../../../shared/brandIcon';

/**
 * Hosts the trainer's home-screen icon set on the app's own origin (deploy/app/src/brand.ts), so iOS can take
 * the logo when the app is added to the home screen. Same-origin, short timeouts, never throws: every failure
 * is `null` and the app carries on with the default icon.
 */
export interface BrandIconSet {
  color: string;
  /** PNG data URLs, as built by features/identity/brandAssets. */
  icon180: string;
  icon512: string;
  logo: string;
  startup: { url: string; width: number; height: number; ratio: number } | null;
}

export interface HostedBrand {
  id: string;
  color: string;
  startup: { width: number; height: number; ratio: number } | null;
}

export interface BrandHosting {
  /** Uploads the icon set; resolves to its id, or null (offline, refused, timeout). */
  upload(set: BrandIconSet): Promise<string | null>;
  info(id: string): Promise<HostedBrand | null>;
  logo(id: string): Promise<Blob | null>;
}

const PNG_DATA = /^data:image\/png;base64,/;
const strip = (dataUrl: string) => dataUrl.replace(PNG_DATA, '');

export class HttpBrandHosting implements BrandHosting {
  constructor(
    private readonly base = '',
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 20_000,
  ) {}

  private async call(path: string, init?: RequestInit): Promise<Response | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetcher(this.base + path, { ...init, signal: ctrl.signal, credentials: 'omit' });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async upload(set: BrandIconSet): Promise<string | null> {
    if (![set.icon180, set.icon512, set.logo].every((u) => PNG_DATA.test(u))) return null;
    const body = {
      color: set.color,
      icon180: strip(set.icon180),
      icon512: strip(set.icon512),
      logo: strip(set.logo),
      startup: set.startup && PNG_DATA.test(set.startup.url) ? { png: strip(set.startup.url), width: set.startup.width, height: set.startup.height, ratio: set.startup.ratio } : null,
    };
    const res = await this.call('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res?.ok) return null;
    try {
      const data = (await res.json()) as { id?: unknown };
      return typeof data.id === 'string' && BRAND_ID.test(data.id) ? data.id : null;
    } catch {
      return null;
    }
  }

  async info(id: string): Promise<HostedBrand | null> {
    if (!BRAND_ID.test(id)) return null;
    const res = await this.call(brandPath(id, 'brand.json'));
    if (!res?.ok) return null;
    try {
      const d = (await res.json()) as { color?: unknown; startup?: { width?: unknown; height?: unknown; ratio?: unknown } | null };
      if (typeof d.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(d.color)) return null;
      const s = d.startup;
      const startup =
        s && typeof s.width === 'number' && typeof s.height === 'number' && typeof s.ratio === 'number' ? { width: s.width, height: s.height, ratio: s.ratio } : null;
      return { id, color: d.color.toUpperCase(), startup };
    } catch {
      return null;
    }
  }

  async logo(id: string): Promise<Blob | null> {
    if (!BRAND_ID.test(id)) return null;
    const res = await this.call(brandPath(id, 'logo.png'));
    if (!res?.ok) return null;
    try {
      const blob = await res.blob();
      return blob.type === 'image/png' && blob.size > 0 ? blob : null;
    } catch {
      return null;
    }
  }
}

/** In-memory hosting for tests. */
export class FakeBrandHosting implements BrandHosting {
  readonly uploads: BrandIconSet[] = [];
  constructor(private readonly brands = new Map<string, { color: string; logo: Blob }>()) {}
  async upload(set: BrandIconSet): Promise<string | null> {
    this.uploads.push(set);
    const id = String(this.uploads.length).padStart(24, '0');
    this.brands.set(id, { color: set.color, logo: new Blob(['png'], { type: 'image/png' }) });
    return id;
  }
  async info(id: string): Promise<HostedBrand | null> {
    const b = this.brands.get(id);
    return b ? { id, color: b.color, startup: null } : null;
  }
  async logo(id: string): Promise<Blob | null> {
    return this.brands.get(id)?.logo ?? null;
  }
}
