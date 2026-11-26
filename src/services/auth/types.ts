import type { Account, AuthError, AuthState } from '@/domain/account';

export type AuthResult = { ok: true; state: AuthState } | { ok: false; error: AuthError };

/**
 * What the app shell needs from accounts. Real: `WorkerAuthService` (the Worker's better-auth API). Fake:
 * `FakeAuthService` (tests). `getState` never needs the network: the last known account lives on the device.
 */
export interface AuthService {
  /** Development and e2e builds only: the "continue as guest" button. Always false in production. */
  readonly guestAllowed: boolean;
  getState(): Promise<AuthState>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(name: string, email: string, password: string): Promise<AuthResult>;
  /** Whether the Worker has Google sign-in configured. False offline or on any error. */
  googleAvailable(): Promise<boolean>;
  /** Address to navigate to for Google sign-in (top-level), or null without a server. */
  googleStartUrl(): string | null;
  /** Finishes a Google sign-in from `location.hash` (`#auth=` / `#auth_error=`). Null when the hash is not ours. */
  completeRedirect(hash: string): Promise<AuthResult | null>;
  /**
   * Background check with the server (only when online): approval status, or the session having ended.
   * Resolves to the new state when it changed, otherwise null. Never throws.
   */
  refresh(): Promise<AuthState | null>;
  /** Forgets the account on this device (the trainer's data stays). Tells the server when it can. */
  signOut(): Promise<void>;
  continueAsGuest(): Promise<AuthState>;
}

export type { Account, AuthError, AuthState };
