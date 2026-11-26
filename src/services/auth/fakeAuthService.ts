import { NO_PLAN, type Account, type AuthState } from '@/domain/account';
import type { AuthResult, AuthService } from './types';

/** In-memory accounts for component tests. Any password of 8+ characters works; `status` sets approval. */
export class FakeAuthService implements AuthService {
  readonly guestAllowed: boolean;
  private state: AuthState;

  constructor(options: { state?: AuthState; guestAllowed?: boolean; status?: Account['status'] } = {}) {
    this.state = options.state ?? { status: 'signedOut' };
    this.guestAllowed = options.guestAllowed ?? true;
    this.status = options.status ?? 'approved';
  }

  private readonly status: Account['status'];

  async getState(): Promise<AuthState> {
    return this.state;
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    if (password.length < 8) return { ok: false, error: 'invalid_credentials' };
    return this.become({ id: 'fake-user', name: 'كابتن تجربة', email, status: this.status, role: 'trainer', plan: NO_PLAN, gym: null });
  }

  async signUp(name: string, email: string): Promise<AuthResult> {
    return this.become({ id: 'fake-user', name, email, status: 'pending', role: 'trainer', plan: NO_PLAN, gym: null });
  }

  async googleAvailable(): Promise<boolean> {
    return false;
  }

  googleStartUrl(): string | null {
    return null;
  }

  async completeRedirect(): Promise<AuthResult | null> {
    return null;
  }

  async refresh(): Promise<AuthState | null> {
    return null;
  }

  async signOut(): Promise<void> {
    this.state = { status: 'signedOut' };
  }

  async continueAsGuest(): Promise<AuthState> {
    if (this.guestAllowed) this.state = { status: 'guest' };
    return this.state;
  }

  private become(account: Account): AuthResult {
    this.state = { status: 'signedIn', account };
    return { ok: true, state: this.state };
  }
}
