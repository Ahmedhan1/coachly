import { isCompleteActivationCode } from './codeFormat';
import type { ActivationResult, ActivationService, ActivationState } from './types';

const SHORT_ALPHABET = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789-]+$/;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

/**
 * Test/e2e stand-in. Accepts any well-formed short code except codes starting with "XXXX" (to exercise
 * the error path). Selected only in the e2e build or with VITE_FAKE_ACTIVATION=1 in dev — never in production.
 */
export class FakeActivationService implements ActivationService {
  private static readonly KEY = 'pt-coach.fake-activation';
  static readonly DEVICE_ID = '00000000-0000-4000-8000-00000000fa4e';

  constructor(private readonly store: KeyValueStore = memoryStore()) {}

  async getState(): Promise<ActivationState> {
    const raw = this.store.getItem(FakeActivationService.KEY);
    return raw ? { status: 'active', licenseId: raw, trainerName: '', expiresAt: null } : { status: 'inactive' };
  }

  async activate(code: string): Promise<ActivationResult> {
    if (!isCompleteActivationCode(code) || !SHORT_ALPHABET.test(code)) return { ok: false, error: 'malformed' };
    if (code.startsWith('XXXX')) return { ok: false, error: 'used' };
    this.store.setItem(FakeActivationService.KEY, code);
    return { ok: true, state: await this.getState() };
  }

  async getDeviceId(): Promise<string> {
    return FakeActivationService.DEVICE_ID;
  }

  async checkRevocation(): Promise<ActivationState | null> {
    return null;
  }
}
