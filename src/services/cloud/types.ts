import type { Result } from '@/domain/nutrition/result';

/**
 * Errors of the cloud backup API, as the app sees them. Every call fails quietly with one of these;
 * nothing throws into UI code.
 * - offline: the browser reports no network (request not attempted)
 * - timeout: no answer within the short timeout
 * - network: fetch failed (DNS, TLS, connection reset, CORS)
 * - unauthorized: license token rejected or revoked (401/403)
 * - not_found: no cloud backup stored yet (GET)
 * - storage_full: the server refused because of the per-license or global storage cap
 * - too_large: body over the request size limit (413)
 * - rate_limited: too many uploads today (429)
 * - server: any other non-2xx answer
 */
export type CloudError =
  | 'offline'
  | 'timeout'
  | 'network'
  | 'unauthorized'
  | 'not_found'
  | 'storage_full'
  | 'too_large'
  | 'rate_limited'
  | 'server';

export interface CloudBackupInfo {
  bytes: number | null;
  /** epoch ms from Last-Modified, when the server sends it */
  updatedAt: number | null;
}

/**
 * Worker contract: `PUT/GET/HEAD /api/backup`, header `Authorization: Bearer <license token>`,
 * body = PTP1 password envelope of the backup zip (opaque to the server).
 */
export interface CloudBackupClient {
  upload(token: string, envelope: Uint8Array): Promise<Result<CloudBackupInfo, CloudError>>;
  download(token: string): Promise<Result<Uint8Array, CloudError>>;
  /** ok(null) when there is no backup on the server. */
  head(token: string): Promise<Result<CloudBackupInfo | null, CloudError>>;
}

export interface NetworkStatus {
  isOnline(): boolean;
  /** Called when the browser goes back online. Returns an unsubscribe function. */
  onOnline(listener: () => void): () => void;
}

/** Source of the license token for `Authorization: Bearer`. null = not activated. */
export interface TokenProvider {
  getToken(): Promise<string | null>;
}
