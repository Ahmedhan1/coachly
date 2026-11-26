import { base64UrlEncode, bytesToHex } from '../../../shared/bytes';
import { authenticate, type Caller } from '../cloud/auth';
import { json, MAX_API_BODY_BYTES, readLimitedText } from '../http';
import type { Deps } from '../ports';
import { RULES } from '../rateLimit';
import { canAddTrainer } from './access';

/**
 * Gym teams. The gym manager is an account the owner gave a gym plan in /admin.
 * - `GET /api/team` (manager): gym, plan, trainers (with roster dates).
 * - `POST /api/team/invite` (manager): a new invite code (the old one stops working). The app puts it, plus the
 *   team key, in an invite link; the key part never reaches the server (URL fragment).
 * - `POST /api/team/join` `{ code }` (any signed-in account, even pending): joins as a pending trainer.
 * - `POST /api/team/members/:id` `{ action: 'approve' | 'remove' }` (manager). Approval counts against max_trainers.
 * - `POST /api/team/leave` (trainer): leaves the gym.
 * - `PUT /api/team/roster` (active trainer or the manager): their client summary, a PTK1 envelope sealed with the
 *   team key. `GET /api/team/rosters` (manager): every trainer's envelope (base64url).
 */
export const ROSTER_MAX_BYTES = 256 * 1024;
const INVITE_CODE = /^[A-Za-z0-9_-]{16,64}$/;
const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await readLimitedText(request, MAX_API_BODY_BYTES);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The caller's own gym, when they are an approved gym manager. */
async function managedGym(deps: Deps, who: Caller): Promise<string | null> {
  if (who.access.viaGym || who.access.plan.kind !== 'gym') return null;
  return (await deps.team.gym(who.userId)) === null ? null : who.userId;
}

export async function routeTeam(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  if (path !== '/api/team' && !path.startsWith('/api/team/')) return null;
  const method = request.method;
  const now = deps.now();

  if (method === 'POST' && path === '/api/team/join') {
    const auth = await authenticate(request, deps, clientKey, RULES.teamWrite, { allow: 'signedIn' });
    if (!auth.ok) return auth.response;
    if (auth.who.access.status === 'disabled') return json({ error: 'disabled' }, 403);
    const body = await readJson(request);
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!INVITE_CODE.test(code)) return json({ error: 'invalid_invite' }, 404);
    const gym = await deps.team.gymByInvite(await sha256Hex(code));
    if (gym === null) return json({ error: 'invalid_invite' }, 404);
    if (gym.id === auth.who.userId) return json({ error: 'own_gym' }, 409);
    if ((await deps.team.gym(auth.who.userId)) !== null) return json({ error: 'is_gym' }, 409);
    const current = auth.who.membership;
    if (current !== null && current.gymId !== gym.id && current.status === 'active') return json({ error: 'in_other_gym' }, 409);
    if (current?.gymId !== gym.id || current.status === 'removed') await deps.team.join(auth.who.userId, gym.id, now);
    return json({ gym: { id: gym.id, name: gym.name } });
  }

  if (method === 'POST' && path === '/api/team/leave') {
    const auth = await authenticate(request, deps, clientKey, RULES.teamWrite, { allow: 'signedIn' });
    if (!auth.ok) return auth.response;
    await deps.team.leave(auth.who.userId);
    return json({ ok: true });
  }

  if (method === 'PUT' && path === '/api/team/roster') {
    const auth = await authenticate(request, deps, clientKey, RULES.teamWrite);
    if (!auth.ok) return auth.response;
    const gymId = (await managedGym(deps, auth.who)) ?? (auth.who.membership?.status === 'active' ? auth.who.membership.gymId : null);
    if (gymId === null) return json({ error: 'no_gym' }, 409);
    const length = Number(request.headers.get('Content-Length') ?? NaN);
    if (!Number.isFinite(length) || length > ROSTER_MAX_BYTES) return json({ error: 'too_large' }, 413);
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > ROSTER_MAX_BYTES) return json({ error: 'too_large' }, 413);
    if (body.length < 32 || new TextDecoder().decode(body.subarray(0, 4)) !== 'PTK1') return json({ error: 'not_encrypted' }, 400);
    await deps.team.putRoster(auth.who.userId, gymId, body, now);
    return json({ ok: true, updatedAt: now });
  }

  // Everything below is for the gym manager only.
  const read = method === 'GET';
  const auth = await authenticate(request, deps, clientKey, read ? RULES.teamRead : RULES.teamWrite);
  if (!auth.ok) return auth.response;
  const gymId = await managedGym(deps, auth.who);
  if (gymId === null) return json({ error: 'not_gym' }, 403);

  if (method === 'GET' && path === '/api/team') {
    const [gym, members] = await Promise.all([deps.team.gym(gymId), deps.team.members(gymId)]);
    const plan = auth.who.access.plan;
    return json({
      gym: { id: gymId, name: gym?.name ?? '', inviteOpen: gym?.inviteOpen ?? false },
      plan: { maxClients: plan.maxClients, maxTrainers: plan.maxTrainers, expiresAt: plan.expiresAt },
      members: members.map((m) => ({ id: m.userId, name: m.name, email: m.email, status: m.status, joinedAt: m.joinedAt, rosterAt: m.rosterAt })),
    });
  }

  if (method === 'GET' && path === '/api/team/rosters') {
    const rosters = await deps.team.rosters(gymId);
    return json({ rosters: rosters.map((r) => ({ userId: r.userId, updatedAt: r.updatedAt, body: base64UrlEncode(r.body) })) });
  }

  if (method === 'POST' && path === '/api/team/invite') {
    const code = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    await deps.team.setInvite(gymId, await sha256Hex(code), now);
    return json({ code });
  }

  const member = /^\/api\/team\/members\/([^/]+)$/.exec(path)?.[1] ?? '';
  if (method === 'POST' && USER_ID.test(member)) {
    const body = await readJson(request);
    const action = body?.action;
    const current = (await deps.team.membership(member)) ?? null;
    if (current === null || current.gymId !== gymId) return json({ error: 'not_found' }, 404);
    if (action === 'approve') {
      if (current.status === 'active') return json({ ok: true });
      if (!canAddTrainer(auth.who.access.plan, await deps.team.countActive(gymId))) return json({ error: 'trainer_limit' }, 409);
      await deps.team.setMemberStatus(gymId, member, 'active', now);
      return json({ ok: true });
    }
    if (action === 'remove') {
      await deps.team.setMemberStatus(gymId, member, 'removed', now);
      return json({ ok: true });
    }
    return json({ error: 'invalid' }, 400);
  }
  return json({ error: 'not_found' }, 404);
}
