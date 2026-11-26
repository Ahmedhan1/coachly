import { createAuth, isAccountStatus, type AccountStatus, type Auth, type AuthSettings } from './auth';

/** A trainer account as the owner dashboard and the API see it. Times are unix seconds. */
export interface AccountRecord {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  createdAt: number;
}

/** The caller of a cloud endpoint, resolved from `Authorization: Bearer <session token>`. */
export interface SessionInfo {
  userId: string;
  sessionId: string;
  account: AccountRecord;
}

/**
 * Everything the Worker needs from the account system. Production: better-auth over D1 (`BetterAuthAccounts`).
 * Routes depend on this interface only, so the database behind it can change (e.g. to Neon) in one place.
 */
export interface Accounts {
  readonly googleEnabled: boolean;
  /** better-auth's own endpoints under /api/auth/*. */
  handle(request: Request): Promise<Response>;
  /** The signed-in account for these request headers (bearer token or cookie), or null. */
  session(headers: Headers): Promise<SessionInfo | null>;
  /** Starts Google sign-in as a top-level redirect. Null when Google is not configured. */
  startGoogle(callbackURL: string, errorCallbackURL: string): Promise<Response | null>;
  /** One-time token (3 minutes) for the session in these headers, so the app can pick the session up. */
  oneTimeToken(headers: Headers): Promise<string | null>;
  list(limit: number): Promise<AccountRecord[]>;
  find(id: string): Promise<AccountRecord | null>;
  setStatus(id: string, status: AccountStatus): Promise<boolean>;
  /** Sets a new email+password password (creates the credential for a Google-only account). */
  setPassword(id: string, password: string): Promise<boolean>;
  /** Signs the account out everywhere. */
  endSessions(id: string): Promise<void>;
}

interface UserLike {
  id: string;
  name?: unknown;
  email?: unknown;
  status?: unknown;
  createdAt?: unknown;
}

function toSeconds(value: unknown): number {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' || typeof value === 'string' ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function toAccountRecord(user: UserLike): AccountRecord {
  return {
    id: user.id,
    name: typeof user.name === 'string' ? user.name : '',
    email: typeof user.email === 'string' ? user.email : '',
    status: isAccountStatus(user.status) ? user.status : 'pending',
    createdAt: toSeconds(user.createdAt),
  };
}

/** better-auth's cookies on this Worker's site (secure and plain names): cleared after the Google handoff. */
const AUTH_COOKIES = ['session_token', 'session_data', 'dont_remember', 'state'].flatMap((name) => [
  `__Secure-better-auth.${name}`,
  `better-auth.${name}`,
]);

export function clearAuthCookies(): string[] {
  return AUTH_COOKIES.map((name) =>
    name.startsWith('__Secure-') ? `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` : `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
}

export class BetterAuthAccounts implements Accounts {
  private instance: Auth | null = null;

  constructor(private readonly settings: AuthSettings) {}

  get googleEnabled(): boolean {
    return this.settings.google !== null;
  }

  /** Built on first use: requests that never touch accounts (client page, cron) do not pay for it. */
  private get auth(): Auth {
    this.instance ??= createAuth(this.settings);
    return this.instance;
  }

  handle(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async session(headers: Headers): Promise<SessionInfo | null> {
    try {
      const found = await this.auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (found === null) return null;
      return { userId: found.user.id, sessionId: found.session.id, account: toAccountRecord(found.user) };
    } catch {
      return null;
    }
  }

  async startGoogle(callbackURL: string, errorCallbackURL: string): Promise<Response | null> {
    if (!this.googleEnabled) return null;
    const { headers, response } = await this.auth.api.signInSocial({
      body: { provider: 'google', callbackURL, errorCallbackURL, newUserCallbackURL: callbackURL, disableRedirect: true },
      returnHeaders: true,
    });
    if (typeof response.url !== 'string') return null;
    const out = new Headers({ Location: response.url, 'Cache-Control': 'no-store' });
    for (const cookie of headers.getSetCookie()) out.append('Set-Cookie', cookie);
    return new Response(null, { status: 302, headers: out });
  }

  async oneTimeToken(headers: Headers): Promise<string | null> {
    try {
      const { token } = await this.auth.api.generateOneTimeToken({ headers });
      return token;
    } catch {
      return null;
    }
  }

  private async context() {
    return this.auth.$context;
  }

  async list(limit: number): Promise<AccountRecord[]> {
    const ctx = await this.context();
    const users = await ctx.internalAdapter.listUsers(limit, 0, { field: 'createdAt', direction: 'desc' });
    return users.map((u) => toAccountRecord(u));
  }

  async find(id: string): Promise<AccountRecord | null> {
    const ctx = await this.context();
    const user = await ctx.internalAdapter.findUserById(id);
    return user === null ? null : toAccountRecord(user);
  }

  async setStatus(id: string, status: AccountStatus): Promise<boolean> {
    const ctx = await this.context();
    if ((await ctx.internalAdapter.findUserById(id)) === null) return false;
    await ctx.internalAdapter.updateUser(id, { status });
    return true;
  }

  async setPassword(id: string, password: string): Promise<boolean> {
    const ctx = await this.context();
    if ((await ctx.internalAdapter.findUserById(id)) === null) return false;
    const hash = await ctx.password.hash(password);
    const accounts = await ctx.internalAdapter.findAccounts(id);
    if (accounts.some((a) => a.providerId === 'credential')) {
      await ctx.internalAdapter.updatePassword(id, hash);
    } else {
      await ctx.internalAdapter.linkAccount({ userId: id, providerId: 'credential', accountId: id, password: hash });
    }
    return true;
  }

  async endSessions(id: string): Promise<void> {
    const ctx = await this.context();
    await ctx.internalAdapter.deleteUserSessions(id);
  }
}
