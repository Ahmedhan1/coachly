import { isAccountStatus, type AccountStatus } from '../auth/auth';
import { DEFAULT_PLAN, resolveAccess, type Access, type AccountKind, type MembershipStatus, type Plan } from './access';

export interface Gym {
  id: string;
  name: string;
  inviteOpen: boolean;
}

export interface Membership {
  gymId: string;
  gymName: string;
  status: MembershipStatus;
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  status: MembershipStatus;
  joinedAt: number;
  rosterAt: number | null;
}

interface PlanRow {
  kind: AccountKind;
  max_clients: number | null;
  max_trainers: number | null;
  expires_at: number | null;
}

const toPlan = (row: PlanRow): Plan => ({ kind: row.kind, maxClients: row.max_clients, maxTrainers: row.max_trainers, expiresAt: row.expires_at });

/** D1 access for plans, gyms, memberships and rosters (tables from migrations/0006_teams.sql). */
export class TeamStore {
  constructor(private readonly db: D1Database) {}

  async plan(userId: string): Promise<Plan | null> {
    const row = await this.db.prepare('SELECT kind, max_clients, max_trainers, expires_at FROM account_plans WHERE user_id = ?').bind(userId).first<PlanRow>();
    return row === null ? null : toPlan(row);
  }

  async plans(userIds: readonly string[]): Promise<Map<string, Plan>> {
    const out = new Map<string, Plan>();
    if (userIds.length === 0) return out;
    const { results } = await this.db
      .prepare(`SELECT user_id, kind, max_clients, max_trainers, expires_at FROM account_plans WHERE user_id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(userIds))
      .all<PlanRow & { user_id: string }>();
    for (const row of results) out.set(row.user_id, toPlan(row));
    return out;
  }

  async setPlan(userId: string, plan: Plan, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO account_plans (user_id, kind, max_clients, max_trainers, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET kind = excluded.kind, max_clients = excluded.max_clients,
           max_trainers = excluded.max_trainers, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
      )
      .bind(userId, plan.kind, plan.maxClients, plan.maxTrainers, plan.expiresAt, now)
      .run();
  }

  async gym(id: string): Promise<Gym | null> {
    const row = await this.db.prepare('SELECT id, name, invite_hash FROM gyms WHERE id = ?').bind(id).first<{ id: string; name: string; invite_hash: string | null }>();
    return row === null ? null : { id: row.id, name: row.name, inviteOpen: row.invite_hash !== null };
  }

  async upsertGym(id: string, name: string, now: number): Promise<void> {
    await this.db
      .prepare('INSERT INTO gyms (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name')
      .bind(id, name, now)
      .run();
  }

  async deleteGym(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM gym_rosters WHERE gym_id = ?').bind(id),
      this.db.prepare('DELETE FROM gym_members WHERE gym_id = ?').bind(id),
      this.db.prepare('DELETE FROM gyms WHERE id = ?').bind(id),
    ]);
  }

  async setInvite(gymId: string, codeHash: string, now: number): Promise<void> {
    await this.db.prepare('UPDATE gyms SET invite_hash = ?, invite_created_at = ? WHERE id = ?').bind(codeHash, now, gymId).run();
  }

  async gymByInvite(codeHash: string): Promise<Gym | null> {
    const row = await this.db.prepare('SELECT id, name FROM gyms WHERE invite_hash = ?').bind(codeHash).first<{ id: string; name: string }>();
    return row === null ? null : { id: row.id, name: row.name, inviteOpen: true };
  }

  async membership(userId: string): Promise<Membership | null> {
    const row = await this.db
      .prepare('SELECT m.gym_id, g.name, m.status FROM gym_members m JOIN gyms g ON g.id = m.gym_id WHERE m.user_id = ?')
      .bind(userId)
      .first<{ gym_id: string; name: string; status: MembershipStatus }>();
    return row === null ? null : { gymId: row.gym_id, gymName: row.name, status: row.status };
  }

  async memberships(userIds: readonly string[]): Promise<Map<string, Membership>> {
    const out = new Map<string, Membership>();
    if (userIds.length === 0) return out;
    const { results } = await this.db
      .prepare(
        `SELECT m.user_id, m.gym_id, g.name, m.status FROM gym_members m JOIN gyms g ON g.id = m.gym_id
         WHERE m.user_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(userIds))
      .all<{ user_id: string; gym_id: string; name: string; status: MembershipStatus }>();
    for (const r of results) out.set(r.user_id, { gymId: r.gym_id, gymName: r.name, status: r.status });
    return out;
  }

  async join(userId: string, gymId: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO gym_members (user_id, gym_id, status, joined_at, updated_at) VALUES (?, ?, 'pending', ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET gym_id = excluded.gym_id, status = 'pending', joined_at = excluded.joined_at,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, gymId, now, now)
      .run();
  }

  async setMemberStatus(gymId: string, userId: string, status: MembershipStatus, now: number): Promise<boolean> {
    const res = await this.db
      .prepare('UPDATE gym_members SET status = ?, updated_at = ? WHERE user_id = ? AND gym_id = ?')
      .bind(status, now, userId, gymId)
      .run();
    if (status === 'removed') await this.db.prepare('DELETE FROM gym_rosters WHERE user_id = ?').bind(userId).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async leave(userId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM gym_rosters WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM gym_members WHERE user_id = ?').bind(userId),
    ]);
  }

  async countActive(gymId: string): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM gym_members WHERE gym_id = ? AND status = 'active'").bind(gymId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async members(gymId: string): Promise<MemberRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.user_id, u.name, u.email, m.status, m.joined_at, r.updated_at AS roster_at
         FROM gym_members m JOIN "user" u ON u.id = m.user_id LEFT JOIN gym_rosters r ON r.user_id = m.user_id
         WHERE m.gym_id = ? AND m.status <> 'removed' ORDER BY m.status DESC, m.joined_at`,
      )
      .bind(gymId)
      .all<{ user_id: string; name: string; email: string; status: MembershipStatus; joined_at: number; roster_at: number | null }>();
    return results.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, status: r.status, joinedAt: r.joined_at, rosterAt: r.roster_at }));
  }

  async countMembers(gymIds: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (gymIds.length === 0) return out;
    const { results } = await this.db
      .prepare(`SELECT gym_id, COUNT(*) AS n FROM gym_members WHERE status = 'active' AND gym_id IN (SELECT value FROM json_each(?)) GROUP BY gym_id`)
      .bind(JSON.stringify(gymIds))
      .all<{ gym_id: string; n: number }>();
    for (const r of results) out.set(r.gym_id, r.n);
    return out;
  }

  async putRoster(userId: string, gymId: string, body: Uint8Array, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO gym_rosters (user_id, gym_id, body, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET gym_id = excluded.gym_id, body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(userId, gymId, body, now)
      .run();
  }

  async rosters(gymId: string): Promise<Array<{ userId: string; updatedAt: number; body: Uint8Array }>> {
    const { results } = await this.db
      .prepare(
        `SELECT r.user_id, r.updated_at, r.body FROM gym_rosters r
         LEFT JOIN gym_members m ON m.user_id = r.user_id
         WHERE r.gym_id = ? AND (r.user_id = ? OR m.status = 'active')`,
      )
      .bind(gymId, gymId)
      .all<{ user_id: string; updated_at: number; body: ArrayBuffer | number[] }>();
    return results.map((r) => ({ userId: r.user_id, updatedAt: r.updated_at, body: new Uint8Array(r.body) }));
  }

  async ownStatus(userId: string): Promise<AccountStatus | null> {
    const row = await this.db.prepare('SELECT status FROM "user" WHERE id = ?').bind(userId).first<{ status: string | null }>();
    if (row === null) return null;
    return isAccountStatus(row.status) ? row.status : 'pending';
  }

  /** Full access of an account: its own approval and plan, and its gym's when it is a gym trainer. */
  async access(userId: string, status: AccountStatus, now: number): Promise<{ access: Access; membership: Membership | null }> {
    const [plan, membership] = await Promise.all([this.plan(userId), this.membership(userId)]);
    // Only an active membership needs the gym's own access (a gym's trainers share its fate).
    let gymAccess: Access = { status: 'disabled', plan: DEFAULT_PLAN, viaGym: false };
    if (membership?.status === 'active') {
      const [gymStatus, gymPlan] = await Promise.all([this.ownStatus(membership.gymId), this.plan(membership.gymId)]);
      gymAccess = resolveAccess({ status: gymStatus ?? 'disabled', plan: gymPlan, membership: null, now });
    }
    const access = resolveAccess({ status, plan, membership: membership === null ? null : { status: membership.status, gymAccess }, now });
    return { access, membership };
  }
}
