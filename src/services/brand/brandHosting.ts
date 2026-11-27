import { brandPath, BRAND_ID } from '../../../shared/brandIcon';

/**
 * Hosts the trainer's home-screen icon set on the app's own origin (deploy/app/src/brand.ts), so iOS can take
 * the logo when the app is added to the home screen. Same-origin, short timeouts, never throws: every failure
 * is a reason (upload) or `null` (reads) and the app carries on with the default icon.
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

/**
 * Why an upload failed, so the install page can say what to do:
 * - `offline`: the phone has no connection (or the request never reached a server);
 * - `timeout`: the connection is too slow;
 * - `unavailable`: the icon service did not answer as expected (not deployed, 404/405/5xx, not JSON);
 * - `rejected`: the server refused the pictures (too large, wrong size);
 * - `busy`: today's upload budget is used up (429).
 */
export type BrandUploadFailure = 'offline' | 'timeout' | 'unavailable' | 'rejected' | 'busy';
export type BrandUploadResult = { ok: true; id: string } | { ok: false; reason: BrandUploadFailure };

export interface BrandHosting {
  /** Uploads the icon set; never throws. */
  upload(set: BrandIconSet): Promise<BrandUploadResult>;
  info(id: string): Promise<HostedBrand | null>;
  logo(id: string): Promise<Blob | null>;
}

const PNG_DATA = /^data:image\/png;base64,/;
const strip = (dataUrl: string) => dataUrl.replace(PNG_DATA, '');

/** Maps a finished upload response to a result (pure, exported for tests). */
export async function uploadResult(res: Response): Promise<BrandUploadResult> {
  if (res.status === 429) return { ok: false, reason: 'busy' };
  if (res.status === 400 || res.status === 413) return { ok: false, reason: 'rejected' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  try {
    const data = (await res.json()) as { id?: unknown };
    return typeof data.id === 'string' && BRAND_ID.test(data.id) ? { ok: true, id: data.id } : { ok: false, reason: 'unavailable' };
  } catch {
    // e.g. the app's index.html instead of the icon service (the route does not reach the Worker).
    return { ok: false, reason: 'unavailable' };
  }
}

type Outcome = { res: Response } | { failure: 'offline' | 'timeout' };

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export class HttpBrandHosting implements BrandHosting {
  constructor(
    private readonly base = '',
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 30_000,
    private readonly offline: () => boolean = isOffline,
  ) {}

  private async request(path: string, init?: RequestInit): Promise<Outcome> {
    if (this.offline()) return { failure: 'offline' };
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, this.timeoutMs);
    try {
      return { res: await this.fetcher(this.base + path, { ...init, signal: ctrl.signal, credentials: 'omit' }) };
    } catch {
      return { failure: timedOut ? 'timeout' : 'offline' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async call(path: string, init?: RequestInit): Promise<Response | null> {
    const out = await this.request(path, init);
    return 'res' in out ? out.res : null;
  }

  async upload(set: BrandIconSet): Promise<BrandUploadResult> {
    if (![set.icon180, set.icon512, set.logo].every((u) => PNG_DATA.test(u))) return { ok: false, reason: 'rejected' };
    const body = {
      color: set.color,
      icon180: strip(set.icon180),
      icon512: strip(set.icon512),
      logo: strip(set.logo),
      startup: set.startup && PNG_DATA.test(set.startup.url) ? { png: strip(set.startup.url), width: set.startup.width, height: set.startup.height, ratio: set.startup.ratio } : null,
    };
    const out = await this.request('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return 'res' in out ? uploadResult(out.res) : { ok: false, reason: out.failure };
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
  /** Set to make the next uploads fail with this reason. */
  failWith: BrandUploadFailure | null = null;
  async upload(set: BrandIconSet): Promise<BrandUploadResult> {
    if (this.failWith) return { ok: false, reason: this.failWith };
    this.uploads.push(set);
    const id = String(this.uploads.length).padStart(24, '0');
    this.brands.set(id, { color: set.color, logo: new Blob(['png'], { type: 'image/png' }) });
    return { ok: true, id };
  }
  async info(id: string): Promise<HostedBrand | null> {
    const b = this.brands.get(id);
    return b ? { id, color: b.color, startup: null } : null;
  }
  async logo(id: string): Promise<Blob | null> {
    return this.brands.get(id)?.logo ?? null;
  }
}
