import { authErrorFromServer, parseAccount, readAuthFragment, type Account, type AuthState } from '@/domain/account';
import type { MetaStore } from '@/data/metaStore';
import type { AuthResult, AuthService } from './types';

/** Device-local (never inside a backup: see DEVICE_LOCAL_META_PREFIXES). */
export const AUTH_META_KEYS = {
  token: 'auth.token',
  account: 'auth.account',
  guest: 'auth.guest',
} as const;

export interface WorkerAuthDeps {
  store: MetaStore;
  /** e.g. https://coachly-api.example.workers.dev; undefined disables every online path. */
  workerUrl: string | undefined;
  /** Origin of this app; the Worker returns the browser here after Google. */
  appOrigin: string;
  fetch: typeof fetch;
  /** navigator.onLine; `false` skips network calls entirely. */
  isOnline?: () => boolean;
  /** Development and e2e builds only. */
  guestAllowed?: boolean;
  requestTimeoutMs?: number;
  checkTimeoutMs?: number;
}

interface Reply {
  status: number;
  body: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Accounts on the Worker (better-auth, email + password and Google). The session token is kept on the device
 * and sent as `Authorization: Bearer`; the app never relies on cookies (the Worker is another site). After the
 * first sign-in nothing here needs the network: `getState` reads the device, `refresh` is a quiet background
 * check that only changes the state when the server answers clearly.
 */
export class WorkerAuthService implements AuthService {
  private readonly d: Required<WorkerAuthDeps>;

  constructor(deps: WorkerAuthDeps) {
    this.d = { isOnline: () => true, guestAllowed: false, requestTimeoutMs: 15_000, checkTimeoutMs: 6_000, ...deps };
  }

  get guestAllowed(): boolean {
    return this.d.guestAllowed;
  }

  async getState(): Promise<AuthState> {
    if (this.d.guestAllowed && (await this.d.store.get(AUTH_META_KEYS.guest)) === true) return { status: 'guest' };
    const token = await this.d.store.get(AUTH_META_KEYS.token);
    const account = parseAccount(await this.d.store.get(AUTH_META_KEYS.account));
    if (typeof token !== 'string' || token === '' || account === null) return { status: 'signedOut' };
    return { status: 'signedIn', account };
  }

  signIn(email: string, password: string): Promise<AuthResult> {
    return this.credentials('/api/auth/sign-in/email', { email, password });
  }

  signUp(name: string, email: string, password: string): Promise<AuthResult> {
    return this.credentials('/api/auth/sign-up/email', { name, email, password });
  }

  async googleAvailable(): Promise<boolean> {
    if (!this.d.workerUrl || !this.d.isOnline()) return false;
    try {
      const reply = await this.request('/api/auth-config', this.d.checkTimeoutMs, { method: 'GET' });
      return reply.status === 200 && isRecord(reply.body) && reply.body.google === true;
    } catch {
      return false;
    }
  }

  googleStartUrl(): string | null {
    if (!this.d.workerUrl) return null;
    return `${this.base()}/auth/google?return=${encodeURIComponent(this.d.appOrigin)}`;
  }

  async completeRedirect(hash: string): Promise<AuthResult | null> {
    const fragment = readAuthFragment(hash);
    if (fragment === null) return null;
    if (fragment.kind === 'error') return { ok: false, error: fragment.error };
    if (!this.d.workerUrl) return { ok: false, error: 'unavailable' };
    let reply: Reply;
    try {
      reply = await this.request('/api/auth/one-time-token/verify', this.d.requestTimeoutMs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fragment.token }),
      });
    } catch {
      return { ok: false, error: 'offline' };
    }
    const session = isRecord(reply.body) && isRecord(reply.body.session) ? reply.body.session : null;
    const user = isRecord(reply.body) ? reply.body.user : null;
    if (reply.status !== 200 || session === null || typeof session.token !== 'string') return { ok: false, error: 'google_failed' };
    return this.accept(session.token, user);
  }

  async refresh(): Promise<AuthState | null> {
    try {
      const before = await this.getState();
      if (before.status !== 'signedIn' || !this.d.workerUrl || !this.d.isOnline()) return null;
      const token = await this.d.store.get(AUTH_META_KEYS.token);
      const reply = await this.request('/api/account', this.d.checkTimeoutMs, { method: 'GET', headers: { Authorization: `Bearer ${String(token)}` } });
      if (reply.status === 401) {
        // The session ended (signed out elsewhere, or the owner set a new password): sign in again. Data stays.
        await this.forget();
        return { status: 'signedOut' };
      }
      const account = reply.status === 200 && isRecord(reply.body) ? parseAccount(reply.body.account) : null;
      if (account === null) return null;
      await this.d.store.set(AUTH_META_KEYS.account, account);
      return sameAccount(before.account, account) ? null : { status: 'signedIn', account };
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    const token = await this.d.store.get(AUTH_META_KEYS.token);
    await this.forget();
    await this.d.store.set(AUTH_META_KEYS.guest, false);
    if (typeof token !== 'string' || !this.d.workerUrl || !this.d.isOnline()) return;
    try {
      await this.request('/api/auth/sign-out', this.d.checkTimeoutMs, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch {
      // Best effort: the session expires on its own.
    }
  }

  async continueAsGuest(): Promise<AuthState> {
    if (!this.d.guestAllowed) return this.getState();
    await this.d.store.set(AUTH_META_KEYS.guest, true);
    return { status: 'guest' };
  }

  private async credentials(path: string, body: Record<string, string>): Promise<AuthResult> {
    if (!this.d.workerUrl) return { ok: false, error: 'unavailable' };
    if (!this.d.isOnline()) return { ok: false, error: 'offline' };
    let reply: Reply;
    try {
      reply = await this.request(path, this.d.requestTimeoutMs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: 'offline' };
    }
    if (reply.status !== 200) return { ok: false, error: authErrorFromServer(reply.status, reply.body) };
    const token = isRecord(reply.body) ? reply.body.token : null;
    if (typeof token !== 'string' || token === '') return { ok: false, error: 'unavailable' };
    return this.accept(token, isRecord(reply.body) ? reply.body.user : null);
  }

  /** Stores the session, then asks the Worker for the approval status (sign-in answers do not carry it). */
  private async accept(token: string, user: unknown): Promise<AuthResult> {
    const fromReply = parseAccount(user);
    if (fromReply === null) return { ok: false, error: 'unavailable' };
    await this.d.store.set(AUTH_META_KEYS.token, token);
    await this.d.store.set(AUTH_META_KEYS.account, fromReply);
    await this.d.store.set(AUTH_META_KEYS.guest, false);
    await this.refresh();
    return { ok: true, state: await this.getState() };
  }

  private async forget(): Promise<void> {
    await this.d.store.set(AUTH_META_KEYS.token, null);
    await this.d.store.set(AUTH_META_KEYS.account, null);
  }

  private base(): string {
    return (this.d.workerUrl ?? '').replace(/\/+$/, '');
  }

  /** One request whose timeout also covers reading the body (a stalled body must not hang the UI). */
  private async request(path: string, timeoutMs: number, init: RequestInit): Promise<Reply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.d.fetch(`${this.base()}${path}`, { ...init, credentials: 'omit', signal: controller.signal });
      return { status: res.status, body: parseJson(await res.text()) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function sameAccount(a: Account, b: Account): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
