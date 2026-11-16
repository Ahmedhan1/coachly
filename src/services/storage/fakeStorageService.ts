import type { PersistOutcome, StorageEstimateResult, StorageService } from './types';

/** In-memory fake for tests and previews. */
export class FakeStorageService implements StorageService {
  persisted = false;
  requests = 0;

  constructor(
    private readonly grant: PersistOutcome = 'granted',
    private readonly usage: StorageEstimateResult | null = { usageBytes: 3_500_000, quotaBytes: 1_000_000_000 },
  ) {}

  async requestPersistence(): Promise<PersistOutcome> {
    this.requests += 1;
    if (this.grant === 'granted') this.persisted = true;
    return this.grant;
  }

  async isPersisted(): Promise<boolean> {
    return this.persisted;
  }

  async estimate(): Promise<StorageEstimateResult | null> {
    return this.usage;
  }
}
