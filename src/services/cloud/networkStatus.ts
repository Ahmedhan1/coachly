import type { NetworkStatus, TokenProvider } from './types';

/** navigator.onLine + the window `online` event. `onLine === true` does not prove the Worker is reachable. */
export class BrowserNetworkStatus implements NetworkStatus {
  isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  onOnline(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  }
}

export class FakeNetworkStatus implements NetworkStatus {
  private listeners = new Set<() => void>();
  constructor(private online = true) {}

  isOnline(): boolean {
    return this.online;
  }

  onOnline(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.online;
    this.online = online;
    if (online && wasOffline) for (const l of [...this.listeners]) l();
  }
}

/** Minimal key/value reader, e.g. the MetaStore. */
export interface KeyValueReader {
  get(key: string): Promise<unknown>;
}

/** Same key as AUTH_META_KEYS.token (src/services/auth): the account session token. */
export const SESSION_TOKEN_META_KEY = 'auth.token';

export function metaTokenProvider(store: KeyValueReader, key: string = SESSION_TOKEN_META_KEY): TokenProvider {
  return {
    getToken: async () => {
      try {
        const v = await store.get(key);
        return typeof v === 'string' && v.length > 0 ? v : null;
      } catch {
        return null;
      }
    },
  };
}

export function staticTokenProvider(token: string | null): TokenProvider {
  return { getToken: async () => token };
}
