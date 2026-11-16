import type { AppDatabase } from '@/data';
import { FakeActivationService } from '@/services/activation/fakeActivationService';
import type { ActivationService } from '@/services/activation/types';
import { LicenseActivationService } from '@/services/license/licenseActivationService';
import { dexieMetaStore } from '@/services/license/metaStore';
import { embeddedPublicKey, parsePublicKey } from '@/services/license/publicKey';

export interface ActivationEnv {
  e2e: boolean;
  dev: boolean;
  fakeInDev: boolean;
  workerUrl: string | undefined;
}

export const buildEnv: ActivationEnv = {
  e2e: import.meta.env.VITE_E2E === '1',
  dev: import.meta.env.DEV,
  fakeInDev: import.meta.env.VITE_FAKE_ACTIVATION === '1',
  workerUrl: import.meta.env.VITE_WORKER_URL || undefined,
};

const E2E_KEY_STORAGE = 'pt-coach.e2e-license-key';

/**
 * e2e build only: `?license-key=<hex>` switches to the REAL service with a test public key (kept for the
 * tab in sessionStorage), so Playwright can activate with an offline long code signed by a key it generated.
 */
function e2ePublicKey(): Uint8Array | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('license-key');
    if (fromUrl) window.sessionStorage.setItem(E2E_KEY_STORAGE, fromUrl);
    const hex = fromUrl ?? window.sessionStorage.getItem(E2E_KEY_STORAGE);
    return hex ? parsePublicKey(hex) : null;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function realService(db: AppDatabase, publicKey: Uint8Array | null, workerUrl: string | undefined): ActivationService {
  return new LicenseActivationService({
    store: dexieMetaStore(db),
    publicKey,
    workerUrl,
    fetch: (input, init) => window.fetch(input, init),
    now: () => new Date(),
    newDeviceId: () => crypto.randomUUID(),
    isOnline: () => navigator.onLine !== false,
  });
}

/** Production builds always get the real service; the fake exists only for e2e and opt-in dev. */
export function createActivationService(db: AppDatabase, env: ActivationEnv = buildEnv): ActivationService {
  if (env.e2e) {
    const testKey = e2ePublicKey();
    return testKey ? realService(db, testKey, undefined) : new FakeActivationService(safeLocalStorage());
  }
  if (env.dev && env.fakeInDev) return new FakeActivationService(safeLocalStorage());
  return realService(db, embeddedPublicKey(), env.workerUrl);
}
