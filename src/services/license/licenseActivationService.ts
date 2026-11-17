import { evaluateLicense, nextLastSeen, type LicenseInvalidReason } from '@/domain/license';
import { normalizeShortCode, unwrapOfflineCode } from '../../../shared/license';
import type { ActivationError, ActivationResult, ActivationService, ActivationState } from '../activation/types';
import type { MetaStore } from './metaStore';

export const META_KEYS = {
  deviceId: 'license.deviceId',
  token: 'license.token',
  dataKey: 'license.dataKey',
  lastSeen: 'license.lastSeen',
  revoked: 'license.revoked',
} as const;

export interface LicenseServiceDeps {
  store: MetaStore;
  /** Embedded Ed25519 public key; null while the placeholder is committed (every code is then rejected). */
  publicKey: Uint8Array | null;
  /** e.g. https://pt-coach-license.example.workers.dev — undefined disables the online paths. */
  workerUrl: string | undefined;
  fetch: typeof fetch;
  now: () => Date;
  newDeviceId: () => string;
  /** navigator.onLine; a `false` skips network calls entirely. */
  isOnline?: () => boolean;
  activateTimeoutMs?: number;
  statusTimeoutMs?: number;
  /** Pause before the single retry of a failed activation request. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

const SERVER_ERRORS: ReadonlySet<string> = new Set(['invalid', 'used', 'expired', 'rate_limited']);

function errorFor(reason: LicenseInvalidReason): ActivationError {
  switch (reason) {
    case 'wrong_device':
      return 'wrong_device';
    case 'activation_window_passed':
    case 'expired':
      return 'expired';
    case 'clock_rollback':
      return 'clock';
    default:
      return 'invalid';
  }
}

/** Invisible format characters (bidi marks/isolates, zero-width, BOM) that Arabic chat apps add when copying. */
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Cleans a pasted code before parsing: drops invisible marks and upper-cases the `PT1.` prefix only. */
export function cleanPastedCode(input: string): string {
  const visible = input.replace(INVISIBLE, '').replace(/\s+/g, '');
  return /^pt1\./i.test(visible) ? `PT1.${visible.slice(4)}` : visible;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Real activation (CLAUDE.md "License contract"). Every token is verified locally with the embedded
 * public key; the network is used only to exchange a short code and, in the background, to learn about
 * revocation. Offline, every call here fails quietly.
 */
export class LicenseActivationService implements ActivationService {
  private readonly d: Required<LicenseServiceDeps>;

  constructor(deps: LicenseServiceDeps) {
    this.d = {
      isOnline: () => true,
      activateTimeoutMs: 12_000,
      statusTimeoutMs: 6_000,
      retryDelayMs: 1_000,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...deps,
    };
  }

  async getDeviceId(): Promise<string> {
    const stored = await this.d.store.get(META_KEYS.deviceId);
    if (typeof stored === 'string' && stored.length > 0) return stored;
    const id = this.d.newDeviceId();
    await this.d.store.set(META_KEYS.deviceId, id);
    return id;
  }

  async getState(): Promise<ActivationState> {
    const token = await this.d.store.get(META_KEYS.token);
    if (typeof token !== 'string' || !this.d.publicKey) return { status: 'inactive' };
    const now = this.d.now();
    const lastSeen = await this.lastSeen();
    const result = await evaluateLicense({
      token,
      publicKey: this.d.publicKey,
      deviceId: await this.getDeviceId(),
      now,
      lastSeen,
      phase: 'launch',
      revoked: (await this.d.store.get(META_KEYS.revoked)) === true,
    });
    if (result.status === 'invalid') {
      if (result.reason === 'expired' || result.reason === 'revoked' || result.reason === 'clock_rollback') {
        return { status: 'locked', reason: result.reason };
      }
      return { status: 'inactive' };
    }
    await this.d.store.set(META_KEYS.lastSeen, nextLastSeen(lastSeen, now).getTime());
    return {
      status: 'active',
      licenseId: result.payload.lid,
      trainerName: result.payload.name,
      expiresAt: result.kind === 'until' ? result.until.getTime() : null,
    };
  }

  async activate(input: string): Promise<ActivationResult> {
    const cleaned = cleanPastedCode(input);
    const offlineToken = unwrapOfflineCode(cleaned);
    if (offlineToken !== null) return this.accept(offlineToken, null);

    const code = normalizeShortCode(cleaned);
    if (code === null) return { ok: false, error: 'malformed' };
    if (!this.d.workerUrl) return { ok: false, error: 'unavailable', detail: 'no server address' };
    if (!this.d.isOnline()) return { ok: false, error: 'offline' };

    const deviceId = await this.getDeviceId();
    let reply: Reply | null = null;
    let detail = 'network';
    // One quiet retry: mobile networks often drop the first request after the app wakes up, and a
    // D1 hiccup answers 5xx. Re-sending is safe: the same device always gets the same license back.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await this.d.sleep(this.d.retryDelayMs);
      try {
        reply = await this.request(
          '/api/activate',
          this.d.activateTimeoutMs,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceId }) },
          async (res) => ({ ok: res.ok, status: res.status, body: parseJson(await res.text()) }),
        );
      } catch (e) {
        reply = null;
        detail = e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'network';
        continue;
      }
      if (reply.status < 500) break;
      detail = `HTTP ${reply.status}`;
    }
    if (reply === null) return { ok: false, error: 'offline', detail };
    const { body } = reply;
    if (!reply.ok) {
      const known = isRecord(body) && typeof body.error === 'string' && SERVER_ERRORS.has(body.error);
      if (known) return { ok: false, error: body.error as ActivationError };
      return { ok: false, error: 'unavailable', detail: `HTTP ${reply.status}` };
    }
    if (!isRecord(body) || typeof body.license !== 'string') return { ok: false, error: 'unavailable', detail: 'bad reply' };
    return this.accept(body.license, typeof body.dataKey === 'string' ? body.dataKey : null);
  }

  async checkRevocation(): Promise<ActivationState | null> {
    try {
      const token = await this.d.store.get(META_KEYS.token);
      if (typeof token !== 'string' || !this.d.workerUrl || !this.d.isOnline()) return null;
      const body = await this.request(
        '/api/license/status',
        this.d.statusTimeoutMs,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        async (res): Promise<unknown> => (res.ok ? res.json() : null),
      );
      if (!isRecord(body) || typeof body.revoked !== 'boolean') return null;
      const wasRevoked = (await this.d.store.get(META_KEYS.revoked)) === true;
      if (body.revoked === wasRevoked) return null;
      await this.d.store.set(META_KEYS.revoked, body.revoked);
      return this.getState();
    } catch {
      return null;
    }
  }

  /** Verifies a token as a first activation and stores it. */
  private async accept(token: string, dataKey: string | null): Promise<ActivationResult> {
    if (!this.d.publicKey) return { ok: false, error: 'invalid' };
    const now = this.d.now();
    const lastSeen = await this.lastSeen();
    const result = await evaluateLicense({
      token,
      publicKey: this.d.publicKey,
      deviceId: await this.getDeviceId(),
      now,
      lastSeen,
      phase: 'activation',
    });
    if (result.status === 'invalid') return { ok: false, error: errorFor(result.reason) };
    await this.d.store.set(META_KEYS.token, token);
    // An offline long code carries no data key: keep one from an earlier online activation, if any.
    if (dataKey !== null) await this.d.store.set(META_KEYS.dataKey, dataKey);
    await this.d.store.set(META_KEYS.revoked, false);
    await this.d.store.set(META_KEYS.lastSeen, nextLastSeen(lastSeen, now).getTime());
    return { ok: true, state: await this.getState() };
  }

  private async lastSeen(): Promise<Date | null> {
    const value = await this.d.store.get(META_KEYS.lastSeen);
    return typeof value === 'number' && Number.isFinite(value) ? new Date(value) : null;
  }

  /** One request whose timeout also covers reading the body (a stalled body must not hang the UI). */
  private async request<T>(path: string, timeoutMs: number, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const base = (this.d.workerUrl ?? '').replace(/\/+$/, '');
      const res = await this.d.fetch(`${base}${path}`, { ...init, signal: controller.signal });
      return await read(res);
    } finally {
      clearTimeout(timer);
    }
  }
}
