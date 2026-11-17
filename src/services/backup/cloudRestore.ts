import { err, type Result } from '@/domain/nutrition/result';
import type { CloudBackupClient, CloudBackupInfo, CloudError, TokenProvider } from '@/services/cloud/types';
import { openBackup } from './localBackupService';
import type { ImportError, ImportOptions, ImportSummary } from './types';

export type CloudRestoreError = CloudError | ImportError | 'not_activated';

export interface CloudRestoreDeps {
  client: CloudBackupClient;
  tokens: TokenProvider;
  importZip(zip: Blob, options: ImportOptions): Promise<Result<ImportSummary, ImportError>>;
}

/** "Restore from cloud" on a new device: download, open with the backup password, import. */
export class CloudRestoreService {
  constructor(private readonly deps: CloudRestoreDeps) {}

  /** What is on the server (size, date), or null when nothing is stored. */
  async info(): Promise<Result<CloudBackupInfo | null, CloudRestoreError>> {
    const token = await this.deps.tokens.getToken();
    if (!token) return err('not_activated');
    return this.deps.client.head(token);
  }

  async restore(password: string, options: Omit<ImportOptions, 'password'> = {}): Promise<Result<ImportSummary, CloudRestoreError>> {
    try {
      const token = await this.deps.tokens.getToken();
      if (!token) return err('not_activated');
      options.onProgress?.({ phase: 'read', done: 0, total: 1 });
      const downloaded = await this.deps.client.download(token);
      if (!downloaded.ok) return downloaded;
      if (options.signal?.aborted) return err('cancelled');
      options.onProgress?.({ phase: 'decrypt', done: 0, total: 1 });
      const zip = await openBackup(downloaded.value, password);
      if (!zip.ok) return zip;
      return await this.deps.importZip(zip.value, options);
    } catch {
      return err('malformed');
    }
  }
}
