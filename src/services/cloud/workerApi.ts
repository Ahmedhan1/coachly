import { err, ok, type Result } from '@/domain/nutrition/result';
import type { CloudError, NetworkStatus, TokenProvider } from './types';
import { errorFromResponse, type FetchFn } from './httpCloudBackupClient';

export interface WorkerApiOptions {
  baseUrl?: string;
  tokens: TokenProvider;
  network?: NetworkStatus;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export interface WorkerRequest {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  json?: unknown;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
  /** Public endpoints skip the license token. */
  auth?: boolean;
}

/**
 * Small JSON/bytes client for the Worker (push, client page, check-ins). Short timeout, never throws: every
 * failure is a CloudError so callers can stay silent and retry later (golden rule).
 */
export class WorkerApi {
  private readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly o: WorkerApiOptions) {
    this.base = (o.baseUrl ?? '').replace(/\/+$/, '');
    this.fetchFn = o.fetchFn ?? ((input, init) => fetch(input, init));
  }

  get configured(): boolean {
    return this.base !== '';
  }

  url(path: string): string {
    return `${this.base}${path}`;
  }

  async send(req: WorkerRequest): Promise<Result<Response, CloudError | 'not_activated'>> {
    return this.exchange(req, async (res) => ok(res));
  }

  async json<T>(req: WorkerRequest): Promise<Result<T, CloudError | 'not_activated'>> {
    return this.exchange(req, async (res) => {
      const text = await res.text();
      try {
        return ok(JSON.parse(text) as T);
      } catch {
        return err('server');
      }
    });
  }

  async bytes(req: WorkerRequest): Promise<Result<Uint8Array, CloudError | 'not_activated'>> {
    return this.exchange(req, async (res) => ok(new Uint8Array(await res.arrayBuffer())));
  }

  /**
   * One request whose timeout covers the whole exchange, body included: a connection that delivers headers
   * and then stalls must not hang a sync forever.
   */
  private async exchange<T>(
    req: WorkerRequest,
    read: (res: Response) => Promise<Result<T, CloudError>>,
  ): Promise<Result<T, CloudError | 'not_activated'>> {
    if (!this.configured) return err('network');
    if (this.o.network && !this.o.network.isOnline()) return err('offline');
    const headers: Record<string, string> = { ...req.headers };
    if (req.auth !== false) {
      const token = await this.o.tokens.getToken();
      if (!token) return err('not_activated');
      headers.Authorization = `Bearer ${token}`;
    }
    let body: BodyInit | undefined;
    if (req.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.json);
    } else if (req.bytes) {
      headers['Content-Type'] = 'application/octet-stream';
      body = req.bytes as BodyInit;
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.o.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchFn(this.url(req.path), { method: req.method, headers, body, signal: controller.signal, cache: 'no-store' });
      if (res.ok) return await read(res);
      let code: string | null = null;
      try {
        const j = (await res.json()) as { error?: unknown };
        code = typeof j.error === 'string' ? j.error : null;
      } catch {
        code = null;
      }
      return err(errorFromResponse(res.status, code));
    } catch {
      return err(timedOut ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
