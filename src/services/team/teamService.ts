import { generateRawKey, openWithKey, sealWithKey } from '../../../shared/envelope';
import { base64UrlDecode, base64UrlEncode } from '../../../shared/bytes';
import { err, ok, type Result } from '@/domain/nutrition/result';
import { inviteLink, parseRoster, type Roster } from '@/domain/team';
import type { WorkerApi } from '@/services/cloud/workerApi';
import type { MetaStore } from '@/services/meta/metaStore';

/**
 * Meta keys. `team.key` is the gym's team key (32 random bytes, base64url): on the manager's phone it is created
 * once; on a trainer's phone it arrives in the invite link fragment. It travels inside the (password-protected)
 * device backup so a restored phone can still read and write rosters. The server never sees it.
 */
export const TEAM_META_KEYS = {
  key: 'team.key',
  /** An invite opened before signing in: `{ code, key }`, joined right after sign-in. */
  pendingJoin: 'team.pendingJoin',
  /** epoch ms of the last roster upload. */
  rosterAt: 'team.rosterAt',
} as const;

export type MembershipStatus = 'pending' | 'active' | 'removed';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: MembershipStatus;
  /** Unix seconds. */
  joinedAt: number;
  rosterAt: number | null;
}

export interface TeamView {
  gym: { id: string; name: string; inviteOpen: boolean };
  plan: { maxClients: number | null; maxTrainers: number | null; expiresAt: number | null };
  members: TeamMember[];
}

/** A trainer's decrypted client summary (or why it could not be read). */
export interface MemberRoster {
  userId: string;
  /** Unix seconds. */
  updatedAt: number;
  roster: Roster | null;
}

/** Worker error codes (`{ error }`) plus the app's own; the UI maps them to Arabic. */
export type TeamError = string;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export class TeamService {
  constructor(
    private readonly api: WorkerApi,
    private readonly meta: MetaStore,
    private readonly appOrigin: string,
  ) {}

  private async key(): Promise<Uint8Array | null> {
    const value = await this.meta.get(TEAM_META_KEYS.key);
    return typeof value === 'string' ? base64UrlDecode(value) : null;
  }

  /** The manager's team key, created on first use. */
  private async ownKey(): Promise<string> {
    const value = await this.meta.get(TEAM_META_KEYS.key);
    if (typeof value === 'string' && base64UrlDecode(value)?.length === 32) return value;
    const fresh = base64UrlEncode(generateRawKey());
    await this.meta.set(TEAM_META_KEYS.key, fresh);
    return fresh;
  }

  async team(): Promise<Result<TeamView, TeamError>> {
    return this.api.jsonOrCode<TeamView>({ method: 'GET', path: '/api/team' });
  }

  /** A new invite link (the previous one stops working). */
  async createInvite(): Promise<Result<string, TeamError>> {
    const key = await this.ownKey();
    const r = await this.api.jsonOrCode<{ code?: unknown }>({ method: 'POST', path: '/api/team/invite', json: {} });
    if (!r.ok) return r;
    return typeof r.value.code === 'string' ? ok(inviteLink(this.appOrigin, r.value.code, key)) : err('server');
  }

  async memberAction(id: string, action: 'approve' | 'remove'): Promise<Result<true, TeamError>> {
    const r = await this.api.jsonOrCode<unknown>({ method: 'POST', path: `/api/team/members/${encodeURIComponent(id)}`, json: { action } });
    return r.ok ? ok(true) : r;
  }

  /** Joins the gym of an invite link and keeps its team key on this phone. */
  async join(invite: { code: string; key: string }): Promise<Result<{ name: string }, TeamError>> {
    if (base64UrlDecode(invite.key)?.length !== 32) return err('invalid_invite');
    const r = await this.api.jsonOrCode<{ gym?: { name?: unknown } }>({ method: 'POST', path: '/api/team/join', json: { code: invite.code } });
    if (!r.ok) return r;
    await this.meta.set(TEAM_META_KEYS.key, invite.key);
    await this.meta.set(TEAM_META_KEYS.pendingJoin, null);
    return ok({ name: typeof r.value.gym?.name === 'string' ? r.value.gym.name : '' });
  }

  async leave(): Promise<Result<true, TeamError>> {
    const r = await this.api.jsonOrCode<unknown>({ method: 'POST', path: '/api/team/leave', json: {} });
    if (!r.ok) return r;
    await this.meta.set(TEAM_META_KEYS.key, null);
    return ok(true);
  }

  /** Seals the roster with the team key and uploads it. `no_key`: this phone never received the key. */
  async uploadRoster(roster: Roster, now: number): Promise<Result<true, TeamError>> {
    const key = await this.key();
    if (key === null) return err('no_key');
    const sealed = await sealWithKey(key, new TextEncoder().encode(JSON.stringify(roster)));
    const r = await this.api.send({ method: 'PUT', path: '/api/team/roster', bytes: sealed });
    if (!r.ok) return r;
    await this.meta.set(TEAM_META_KEYS.rosterAt, now);
    return ok(true);
  }

  /** Every trainer's roster, decrypted on this phone. A roster sealed with another key reads as null. */
  async rosters(): Promise<Result<MemberRoster[], TeamError>> {
    const key = await this.key();
    const r = await this.api.jsonOrCode<{ rosters?: unknown }>({ method: 'GET', path: '/api/team/rosters' });
    if (!r.ok) return r;
    const list = Array.isArray(r.value.rosters) ? r.value.rosters : [];
    const out: MemberRoster[] = [];
    for (const item of list) {
      if (!isRecord(item) || typeof item.userId !== 'string' || typeof item.body !== 'string') continue;
      const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
      const bytes = base64UrlDecode(item.body);
      let roster: Roster | null = null;
      if (key !== null && bytes !== null) {
        const opened = await openWithKey(key, bytes);
        if (opened.ok) {
          try {
            roster = parseRoster(JSON.parse(new TextDecoder().decode(opened.data)));
          } catch {
            roster = null;
          }
        }
      }
      out.push({ userId: item.userId, updatedAt, roster });
    }
    return ok(out);
  }
}
