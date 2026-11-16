import { err, ok, type Result } from '@/domain/nutrition/result';
import type { CloudBackupClient, CloudBackupInfo, CloudError, NetworkStatus } from './types';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpCloudBackupClientOptions {
  /** Worker origin, e.g. `https://api.example.com`. Empty = same origin. */
  baseUrl?: string;
  fetchFn?: FetchFn;
  network?: NetworkStatus;
  /** HEAD/GET-metadata timeout. */
  shortTimeoutMs?: number;
  /** Transfer timeout = base + bytes / assumed slowest throughput, capped. */
  transferBaseMs?: number;
  transferBytesPerSecond?: number;
  transferMaxMs?: number;
}

const DEFAULTS = {
  shortTimeoutMs: 8_000,
  transferBaseMs: 15_000,
  transferBytesPerSecond: 150_000,
  transferMaxMs: 120_000,
};

/** Upload/download budget for `bytes` (expected size for downloads). */
export function transferTimeoutMs(bytes: number, o: HttpCloudBackupClientOptions = {}): number {
  const base = o.transferBaseMs ?? DEFAULTS.transferBaseMs;
  const rate = o.transferBytesPerSecond ?? DEFAULTS.transferBytesPerSecond;
  const max = o.transferMaxMs ?? DEFAULTS.transferMaxMs;
  return Math.min(max, Math.round(base + (bytes / rate) * 1000));
}

/** Maps an HTTP status and the Worker's `{ error }` code to a CloudError. */
export function errorFromResponse(status: number, code: string | null): CloudError {
  if (code === 'storage_full' || status === 507) return 'storage_full';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 413 || code === 'too_large') return 'too_large';
  if (status === 429 || code === 'rate_limited') return 'rate_limited';
  return 'server';
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

function infoFrom(res: Response, fallbackBytes: number | null): CloudBackupInfo {
  const len = Number(res.headers.get('content-length'));
  const modified = Date.parse(res.headers.get('last-modified') ?? '');
  return {
    bytes: Number.isFinite(len) && res.headers.has('content-length') ? len : fallbackBytes,
    updatedAt: Number.isFinite(modified) ? modified : null,
  };
}

/** Browser implementation over fetch with AbortController timeouts. Never throws. */
export class HttpCloudBackupClient implements CloudBackupClient {
  private readonly url: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly options: HttpCloudBackupClientOptions = {}) {
    this.url = `${(options.baseUrl ?? '').replace(/\/+$/, '')}/api/backup`;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  /**
   * One request with a timeout that covers the whole exchange, including reading the body in `read`.
   * Network failures and timeouts become CloudErrors.
   */
  private async request<T>(
    method: 'PUT' | 'GET' | 'HEAD',
    token: string,
    timeoutMs: number,
    read: (res: Response) => Promise<Result<T, CloudError>>,
    body?: Uint8Array,
  ): Promise<Result<T, CloudError>> {
    if (this.options.network && !this.options.network.isOnline()) return err('offline');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const res = await this.fetchFn(this.url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
        },
        body: body as BodyInit | undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
      return await read(res);
    } catch {
      return err(timedOut ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  async upload(token: string, envelope: Uint8Array): Promise<Result<CloudBackupInfo, CloudError>> {
    return this.request(
      'PUT',
      token,
      transferTimeoutMs(envelope.length, this.options),
      async (res) => (res.ok ? ok({ ...infoFrom(res, envelope.length), bytes: envelope.length }) : err(errorFromResponse(res.status, await errorCode(res)))),
      envelope,
    );
  }

  async head(token: string): Promise<Result<CloudBackupInfo | null, CloudError>> {
    return this.request('HEAD', token, this.options.shortTimeoutMs ?? DEFAULTS.shortTimeoutMs, async (res) => {
      if (res.status === 404) return ok(null);
      return res.ok ? ok(infoFrom(res, null)) : err(errorFromResponse(res.status, null));
    });
  }

  async download(token: string): Promise<Result<Uint8Array, CloudError>> {
    const info = await this.head(token);
    if (!info.ok) return info;
    if (info.value === null) return err('not_found');
    const timeout = transferTimeoutMs(info.value.bytes ?? 20 * 1024 * 1024, this.options);
    return this.request('GET', token, timeout, async (res) =>
      res.ok ? ok(new Uint8Array(await res.arrayBuffer())) : err(errorFromResponse(res.status, await errorCode(res))),
    );
  }
}
