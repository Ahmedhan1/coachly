import { err, ok, type Result } from '@/domain/nutrition/result';
import type { CloudBackupClient, CloudBackupInfo, CloudError } from './types';

/**
 * In-memory server for tests and the UI's demo mode. Queue failures with `failNext`; otherwise uploads
 * are stored and downloads return them.
 */
export class FakeCloudBackupClient implements CloudBackupClient {
  stored: Uint8Array | null = null;
  storedAt: number | null = null;
  readonly calls: { method: 'PUT' | 'GET' | 'HEAD'; token: string; bytes?: number }[] = [];
  private failures: CloudError[] = [];
  /** Uploads larger than this answer `storage_full`. */
  capacityBytes = Number.POSITIVE_INFINITY;
  validToken: string | null = null;

  constructor(private readonly now: () => number = () => 0) {}

  failNext(...errors: CloudError[]): void {
    this.failures.push(...errors);
  }

  private check(token: string): CloudError | null {
    const queued = this.failures.shift();
    if (queued) return queued;
    if (this.validToken !== null && token !== this.validToken) return 'unauthorized';
    return null;
  }

  async upload(token: string, envelope: Uint8Array): Promise<Result<CloudBackupInfo, CloudError>> {
    this.calls.push({ method: 'PUT', token, bytes: envelope.length });
    const e = this.check(token);
    if (e) return err(e);
    if (envelope.length > this.capacityBytes) return err('storage_full');
    this.stored = envelope.slice();
    this.storedAt = this.now();
    return ok({ bytes: envelope.length, updatedAt: this.storedAt });
  }

  async download(token: string): Promise<Result<Uint8Array, CloudError>> {
    this.calls.push({ method: 'GET', token });
    const e = this.check(token);
    if (e) return err(e);
    return this.stored ? ok(this.stored.slice()) : err('not_found');
  }

  async head(token: string): Promise<Result<CloudBackupInfo | null, CloudError>> {
    this.calls.push({ method: 'HEAD', token });
    const e = this.check(token);
    if (e) return err(e);
    return ok(this.stored ? { bytes: this.stored.length, updatedAt: this.storedAt } : null);
  }
}
