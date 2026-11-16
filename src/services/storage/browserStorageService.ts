import type { PersistOutcome, StorageEstimateResult, StorageService } from './types';

/** Real implementation over `navigator.storage`. Every call fails soft. */
export class BrowserStorageService implements StorageService {
  constructor(private readonly storage: StorageManager | undefined = globalThis.navigator?.storage) {}

  async requestPersistence(): Promise<PersistOutcome> {
    if (!this.storage?.persist) return 'unsupported';
    try {
      if (await this.storage.persisted()) return 'granted';
      return (await this.storage.persist()) ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  async isPersisted(): Promise<boolean> {
    try {
      return (await this.storage?.persisted?.()) ?? false;
    } catch {
      return false;
    }
  }

  async estimate(): Promise<StorageEstimateResult | null> {
    try {
      const e = await this.storage?.estimate?.();
      if (!e || e.usage === undefined || e.quota === undefined) return null;
      return { usageBytes: e.usage, quotaBytes: e.quota };
    } catch {
      return null;
    }
  }
}
