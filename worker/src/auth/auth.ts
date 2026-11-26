import { betterAuth } from 'better-auth';
import { bearer, oneTimeToken } from 'better-auth/plugins';
import { hashPassword, verifyPassword } from './password';

/**
 * Trainer accounts (better-auth): email + password and Google. Every new account starts `pending`; the owner
 * approves it in /admin. The app is on another site (Cloudflare Pages), so it never relies on cookies: it keeps
 * the session token and sends `Authorization: Bearer` (bearer plugin). Google sign-in is a top-level redirect
 * that ends on this Worker (first-party cookies), which hands the session to the app with a one-time token.
 */
export type AccountStatus = 'pending' | 'approved' | 'disabled';
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['pending', 'approved', 'disabled'];

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export const AUTH_BASE_PATH = '/api/auth';
export const MIN_PASSWORD_LENGTH = 8;
const DAY_SECONDS = 86_400;

export interface AuthSettings {
  /** Accounts live in the Worker's D1 database (tables from migrations/0005_accounts.sql). */
  database: D1Database;
  /** BETTER_AUTH_SECRET: signs cookies and tokens. At least 32 characters. */
  secret: string;
  /** Public address of this Worker, e.g. https://pt-coach-license.example.workers.dev */
  baseURL: string;
  /** The app's origin(s); browsers there may call the auth API. */
  appOrigins: readonly string[];
  google: { clientId: string; clientSecret: string } | null;
}

export function createAuth(settings: AuthSettings) {
  return betterAuth({
    appName: 'PT Coach',
    // Privacy rule: nothing about trainers leaves the Worker. (Opt-in upstream; switched off explicitly.)
    telemetry: { enabled: false },
    baseURL: settings.baseURL,
    basePath: AUTH_BASE_PATH,
    secret: settings.secret,
    database: settings.database,
    trustedOrigins: [settings.baseURL, ...settings.appOrigins],
    emailAndPassword: {
      enabled: true,
      // No email is ever sent (zero-cost rule): no verification mail, the owner resets passwords in /admin.
      requireEmailVerification: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: true,
      // Native PBKDF2 instead of JS scrypt: fits the Free plan's 10 ms CPU per request (see ./password.ts).
      password: { hash: (password) => hashPassword(password), verify: verifyPassword },
    },
    socialProviders: settings.google === null ? {} : { google: { ...settings.google, prompt: 'select_account' } },
    user: {
      additionalFields: {
        // Owner approval. `input: false`: a sign-up request can never set it.
        status: { type: 'string', required: false, defaultValue: 'pending', input: false },
      },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    session: {
      // The app works offline for months; the session only matters for cloud calls. Refreshed daily while used.
      expiresIn: 365 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    // The Worker's own D1 limiter guards /api/auth (see app.ts); better-auth's memory limiter is per isolate.
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: {
      // Only Google's state cookie and the short-lived handoff cookie ever live on this site.
      defaultCookieAttributes: { sameSite: 'lax', secure: true, httpOnly: true },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    plugins: [
      bearer(),
      oneTimeToken({ expiresIn: 3, storeToken: 'hashed', disableClientRequest: true, disableSetSessionCookie: true }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
