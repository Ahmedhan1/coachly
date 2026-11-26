import { describe, expect, it, vi } from 'vitest';
import { memoryMetaStore } from '@/services/meta/metaStore';
import { AUTH_META_KEYS, WorkerAuthService, type WorkerAuthDeps } from './workerAuthService';

const WORKER = 'https://worker.example';
const APP = 'https://app.example';
const USER = { id: 'u1', name: 'كابتن أحمد', email: 'a@b.co' };
/** What parseAccount adds for an account without a plan or gym. */
const EXTRA = { role: 'trainer', plan: { maxClients: null, maxTrainers: null, expiresAt: null }, gym: null };

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function setup(routes: Record<string, Route>, extra: Partial<WorkerAuthDeps> = {}) {
  const store = memoryMetaStore();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = routes[url.replace(WORKER, '')];
    if (!route) throw new TypeError(`no route for ${url}`);
    return route(init);
  });
  const service = new WorkerAuthService({ store, workerUrl: WORKER, appOrigin: APP, fetch: fetchMock as typeof fetch, ...extra });
  return { store, fetchMock, service };
}

const approved = () => reply(200, { account: { ...USER, status: 'approved' } });

describe('WorkerAuthService', () => {
  it('starts signed out, with no network needed', async () => {
    const { service, fetchMock } = setup({});
    expect(await service.getState()).toEqual({ status: 'signedOut' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in with email + password, keeps the token on the device, and learns the approval status', async () => {
    const { service, store, fetchMock } = setup({
      '/api/auth/sign-in/email': () => reply(200, { token: 'tok-1', user: USER }),
      '/api/account': approved,
    });
    const result = await service.signIn('a@b.co', 'secret-123');
    expect(result).toEqual({ ok: true, state: { status: 'signedIn', account: { ...USER, ...EXTRA, status: 'approved' } } });
    expect(store.dump()[AUTH_META_KEYS.token]).toBe('tok-1');
    const accountCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/account'));
    expect((accountCall?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    // Never cookies: the Worker is another site.
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'omit')).toBe(true);
  });

  it('a new sign-up is pending until the owner approves it', async () => {
    const { service } = setup({
      '/api/auth/sign-up/email': () => reply(200, { token: 'tok-2', user: USER }),
      '/api/account': () => reply(200, { account: { ...USER, ...EXTRA, status: 'pending' } }),
    });
    const result = await service.signUp(USER.name, USER.email, 'secret-123');
    expect(result.ok && result.state).toEqual({ status: 'signedIn', account: { ...USER, ...EXTRA, status: 'pending' } });
  });

  it('maps server errors and network failures without throwing', async () => {
    const { service } = setup({
      '/api/auth/sign-in/email': () => reply(401, { code: 'INVALID_EMAIL_OR_PASSWORD' }),
      '/api/auth/sign-up/email': () => reply(422, { code: 'USER_ALREADY_EXISTS' }),
    });
    expect(await service.signIn('a@b.co', 'wrong')).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(await service.signUp('n', 'a@b.co', 'secret-123')).toEqual({ ok: false, error: 'email_taken' });
    const down = setup({ '/api/auth/sign-in/email': () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await down.service.signIn('a@b.co', 'x')).toEqual({ ok: false, error: 'offline' });
    const offline = setup({}, { isOnline: () => false });
    expect(await offline.service.signIn('a@b.co', 'x')).toEqual({ ok: false, error: 'offline' });
    const noServer = setup({}, { workerUrl: undefined });
    expect(await noServer.service.signIn('a@b.co', 'x')).toEqual({ ok: false, error: 'unavailable' });
  });

  it('finishes Google sign-in from #auth=<one-time token>', async () => {
    const { service, fetchMock } = setup({
      '/api/auth/one-time-token/verify': () => reply(200, { session: { token: 'tok-g' }, user: USER }),
      '/api/account': approved,
    });
    expect(await service.completeRedirect('#/clients')).toBeNull();
    const result = await service.completeRedirect('#auth=one-time-abc');
    expect(result).toEqual({ ok: true, state: { status: 'signedIn', account: { ...USER, ...EXTRA, status: 'approved' } } });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ token: 'one-time-abc' });
    expect(await service.completeRedirect('#auth_error=google_failed')).toEqual({ ok: false, error: 'google_failed' });
  });

  it('builds the Google start address on the Worker, returning to this app', () => {
    expect(setup({}).service.googleStartUrl()).toBe(`${WORKER}/auth/google?return=${encodeURIComponent(APP)}`);
    expect(setup({}, { workerUrl: undefined }).service.googleStartUrl()).toBeNull();
  });

  it('asks the Worker whether Google is configured; false on any failure', async () => {
    expect(await setup({ '/api/auth-config': () => reply(200, { google: true }) }).service.googleAvailable()).toBe(true);
    expect(await setup({ '/api/auth-config': () => reply(500, {}) }).service.googleAvailable()).toBe(false);
    expect(await setup({}).service.googleAvailable()).toBe(false);
  });

  it('refresh: picks up approval or disabling, signs out on 401, and stays quiet otherwise', async () => {
    let answer: () => Response = () => reply(200, { account: { ...USER, ...EXTRA, status: 'pending' } });
    const { service } = setup({
      '/api/auth/sign-up/email': () => reply(200, { token: 'tok', user: USER }),
      '/api/account': () => answer(),
    });
    await service.signUp(USER.name, USER.email, 'secret-123');
    expect(await service.refresh()).toBeNull();
    answer = approved;
    expect(await service.refresh()).toEqual({ status: 'signedIn', account: { ...USER, ...EXTRA, status: 'approved' } });
    answer = () => reply(500, { error: 'server_error' });
    expect(await service.refresh()).toBeNull();
    expect((await service.getState()).status).toBe('signedIn');
    answer = () => reply(401, { error: 'invalid' });
    expect(await service.refresh()).toEqual({ status: 'signedOut' });
    expect(await service.getState()).toEqual({ status: 'signedOut' });
  });

  it('refresh never touches the network offline', async () => {
    const { service, store, fetchMock } = setup({}, { isOnline: () => false });
    await store.set(AUTH_META_KEYS.token, 'tok');
    await store.set(AUTH_META_KEYS.account, { ...USER, status: 'approved' });
    expect(await service.refresh()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await service.getState()).status).toBe('signedIn');
  });

  it('sign-out forgets the account on this device even when the server cannot be reached', async () => {
    const { service, store } = setup({ '/api/auth/sign-out': () => Promise.reject(new TypeError('down')) });
    await store.set(AUTH_META_KEYS.token, 'tok');
    await store.set(AUTH_META_KEYS.account, { ...USER, status: 'approved' });
    await service.signOut();
    expect(await service.getState()).toEqual({ status: 'signedOut' });
  });

  it('guest mode exists only when the build allows it', async () => {
    const prod = setup({});
    expect(prod.service.guestAllowed).toBe(false);
    expect(await prod.service.continueAsGuest()).toEqual({ status: 'signedOut' });
    await prod.store.set(AUTH_META_KEYS.guest, true);
    expect(await prod.service.getState()).toEqual({ status: 'signedOut' });

    const dev = setup({}, { guestAllowed: true });
    expect(await dev.service.continueAsGuest()).toEqual({ status: 'guest' });
    expect(await dev.service.getState()).toEqual({ status: 'guest' });
    await dev.service.signOut();
    expect(await dev.service.getState()).toEqual({ status: 'signedOut' });
  });
});
