/**
 * Trainer accounts (pure rules). The Worker (better-auth) owns accounts; the owner approves each one. The app
 * keeps the last known account on the device, so after the first sign-in it works without the network.
 */
export type AccountStatus = 'pending' | 'approved' | 'disabled';

export interface Account {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
}

export type AuthState =
  | { status: 'signedOut' }
  | { status: 'signedIn'; account: Account }
  /** Development / e2e builds only: no account, no cloud. */
  | { status: 'guest' };

export type AuthError =
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'missing_name'
  | 'missing_password'
  | 'rate_limited'
  | 'offline'
  | 'unavailable'
  | 'google_failed'
  | 'google_unavailable';

/** Same minimum as the Worker (worker/src/auth/auth.ts). */
export const MIN_PASSWORD_LENGTH = 8;

const STATUSES: readonly AccountStatus[] = ['pending', 'approved', 'disabled'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseAccount(value: unknown): Account | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  const status = STATUSES.find((s) => s === value.status) ?? 'pending';
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : '',
    email: typeof value.email === 'string' ? value.email : '',
    status,
  };
}

export function canUseApp(state: AuthState): boolean {
  return state.status === 'guest' || (state.status === 'signedIn' && state.account.status === 'approved');
}

export type AuthFragment = { kind: 'token'; token: string } | { kind: 'error'; error: 'google_failed' | 'google_unavailable' };

/** `#auth=<one-time token>` or `#auth_error=<code>`, as the Worker's Google handoff sends the browser back. */
export function readAuthFragment(hash: string): AuthFragment | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('auth');
  if (token !== null) return /^[A-Za-z0-9_-]{8,256}$/.test(token) ? { kind: 'token', token } : null;
  const error = params.get('auth_error');
  if (error === null) return null;
  return { kind: 'error', error: error === 'google_unavailable' ? 'google_unavailable' : 'google_failed' };
}

/** Maps a non-2xx answer from the Worker's auth API (better-auth `{ code }` or ours `{ error }`). */
export function authErrorFromServer(status: number, body: unknown): AuthError {
  if (status === 429) return 'rate_limited';
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : '';
  if (code.startsWith('USER_ALREADY_EXISTS')) return 'email_taken';
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') return 'weak_password';
  if (code === 'INVALID_EMAIL') return 'invalid_email';
  if (status === 401) return 'invalid_credentials';
  return 'unavailable';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Validated<T> = ({ ok: true } & T) | { ok: false; error: AuthError };

export function validateSignIn(input: { email: string; password: string }): Validated<{ email: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'invalid_email' };
  if (input.password === '') return { ok: false, error: 'missing_password' };
  return { ok: true, email };
}

export function validateSignUp(input: { name: string; email: string; password: string }): Validated<{ name: string; email: string }> {
  const name = input.name.trim();
  if (name === '') return { ok: false, error: 'missing_name' };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'invalid_email' };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'weak_password' };
  return { ok: true, name, email };
}
