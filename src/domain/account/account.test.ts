import { describe, expect, it } from 'vitest';
import {
  authErrorFromServer,
  canUseApp,
  parseAccount,
  readAuthFragment,
  validateSignIn,
  validateSignUp,
  MIN_PASSWORD_LENGTH,
} from './account';

describe('readAuthFragment', () => {
  it('reads the one-time token the Worker hands back after Google', () => {
    expect(readAuthFragment('#auth=abc_DEF-123')).toEqual({ kind: 'token', token: 'abc_DEF-123' });
  });

  it('reads an error', () => {
    expect(readAuthFragment('#auth_error=google_failed')).toEqual({ kind: 'error', error: 'google_failed' });
    expect(readAuthFragment('#auth_error=google_unavailable')).toEqual({ kind: 'error', error: 'google_unavailable' });
    expect(readAuthFragment('#auth_error=whatever')).toEqual({ kind: 'error', error: 'google_failed' });
  });

  it('ignores every other hash, including app routes', () => {
    expect(readAuthFragment('')).toBeNull();
    expect(readAuthFragment('#/clients')).toBeNull();
    expect(readAuthFragment('#auth=')).toBeNull();
    expect(readAuthFragment('#auth=has space')).toBeNull();
  });
});

describe('authErrorFromServer', () => {
  it('maps better-auth codes to the messages the trainer sees', () => {
    expect(authErrorFromServer(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('invalid_credentials');
    expect(authErrorFromServer(422, { code: 'USER_ALREADY_EXISTS' })).toBe('email_taken');
    expect(authErrorFromServer(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe('email_taken');
    expect(authErrorFromServer(400, { code: 'PASSWORD_TOO_SHORT' })).toBe('weak_password');
    expect(authErrorFromServer(400, { code: 'INVALID_EMAIL' })).toBe('invalid_email');
    expect(authErrorFromServer(429, { error: 'rate_limited' })).toBe('rate_limited');
    expect(authErrorFromServer(429, null)).toBe('rate_limited');
  });

  it('treats anything else as the server being unavailable', () => {
    expect(authErrorFromServer(500, { error: 'server_error' })).toBe('unavailable');
    expect(authErrorFromServer(503, null)).toBe('unavailable');
    expect(authErrorFromServer(401, { code: 'SOMETHING_NEW' })).toBe('invalid_credentials');
    expect(authErrorFromServer(400, 'not json')).toBe('unavailable');
  });
});

describe('parseAccount', () => {
  it('accepts the Worker account shape and defaults an unknown status to pending', () => {
    expect(parseAccount({ id: 'u1', name: 'كابتن', email: 'a@b.co', status: 'approved' })).toEqual({
      id: 'u1',
      name: 'كابتن',
      email: 'a@b.co',
      status: 'approved',
    });
    expect(parseAccount({ id: 'u1', name: 'x', email: 'a@b.co', status: 'weird' })?.status).toBe('pending');
    expect(parseAccount({ id: 'u1', email: 'a@b.co' })).toEqual({ id: 'u1', name: '', email: 'a@b.co', status: 'pending' });
  });

  it('rejects anything without an id', () => {
    expect(parseAccount(null)).toBeNull();
    expect(parseAccount({ email: 'a@b.co' })).toBeNull();
    expect(parseAccount('u1')).toBeNull();
  });
});

describe('canUseApp', () => {
  it('lets approved accounts and guests in; pending and disabled wait', () => {
    expect(canUseApp({ status: 'guest' })).toBe(true);
    const account = { id: 'u', name: 'n', email: 'e@x.co' };
    expect(canUseApp({ status: 'signedIn', account: { ...account, status: 'approved' } })).toBe(true);
    expect(canUseApp({ status: 'signedIn', account: { ...account, status: 'pending' } })).toBe(false);
    expect(canUseApp({ status: 'signedIn', account: { ...account, status: 'disabled' } })).toBe(false);
    expect(canUseApp({ status: 'signedOut' })).toBe(false);
  });
});

describe('form validation', () => {
  it('sign-in needs an email-looking address and a password', () => {
    expect(validateSignIn({ email: ' Coach@Example.com ', password: 'x' })).toEqual({ ok: true, email: 'coach@example.com' });
    expect(validateSignIn({ email: 'coach', password: 'x' })).toEqual({ ok: false, error: 'invalid_email' });
    expect(validateSignIn({ email: 'coach@example.com', password: '' })).toEqual({ ok: false, error: 'missing_password' });
  });

  it('sign-up also needs a name and a long enough password', () => {
    const good = { name: ' كابتن أحمد ', email: 'a@b.co', password: 'x'.repeat(MIN_PASSWORD_LENGTH) };
    expect(validateSignUp(good)).toEqual({ ok: true, name: 'كابتن أحمد', email: 'a@b.co' });
    expect(validateSignUp({ ...good, name: '  ' })).toEqual({ ok: false, error: 'missing_name' });
    expect(validateSignUp({ ...good, password: 'short' })).toEqual({ ok: false, error: 'weak_password' });
    expect(validateSignUp({ ...good, email: 'nope' })).toEqual({ ok: false, error: 'invalid_email' });
  });
});
