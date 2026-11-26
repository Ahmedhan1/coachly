import type { AccountStatus } from '../auth/auth';

/**
 * Who may use the app, and under which plan (pure rules, no I/O).
 *
 * Hierarchy: owner (/admin) → gyms → trainers. The owner approves independent trainers and gym managers
 * (`user.status`). A gym manager approves the trainers who joined their gym (`membership`); that never changes
 * the trainer's own `user.status`, so leaving or being removed from a gym falls back to the owner's decision.
 */
export type AccessStatus = 'pending' | 'approved' | 'disabled' | 'expired';
export type AccountKind = 'trainer' | 'gym';
export type MembershipStatus = 'pending' | 'active' | 'removed';

export interface Plan {
  kind: AccountKind;
  /** Clients per trainer; null = no limit. */
  maxClients: number | null;
  /** Trainers in a gym (gym plans only); null = no limit. */
  maxTrainers: number | null;
  /** Unix seconds; null = no end date. */
  expiresAt: number | null;
}

export const DEFAULT_PLAN: Plan = { kind: 'trainer', maxClients: null, maxTrainers: null, expiresAt: null };

export interface AccessInput {
  /** The account's own approval by the owner. */
  status: AccountStatus;
  /** The account's own plan (owner-set), or null when none was set. */
  plan: Plan | null;
  /** Gym membership, when the trainer joined a gym. */
  membership: { status: MembershipStatus; gymAccess: Access } | null;
  /** Unix seconds. */
  now: number;
}

export interface Access {
  status: AccessStatus;
  plan: Plan;
  /** True when the access comes from a gym membership (the gym's plan applies). */
  viaGym: boolean;
}

function withExpiry(status: AccessStatus, plan: Plan, now: number): AccessStatus {
  return status === 'approved' && plan.expiresAt !== null && now >= plan.expiresAt ? 'expired' : status;
}

/** Access of an account that is not using a gym membership (independent trainer or gym manager). */
function ownAccess(input: Pick<AccessInput, 'status' | 'plan' | 'now'>): Access {
  const plan = input.plan ?? DEFAULT_PLAN;
  return { status: withExpiry(input.status, plan, input.now), plan, viaGym: false };
}

export function resolveAccess(input: AccessInput): Access {
  if (input.status === 'disabled') return { status: 'disabled', plan: input.plan ?? DEFAULT_PLAN, viaGym: false };
  const own = ownAccess(input);
  const membership = input.membership;
  if (membership === null) return own;
  if (membership.status === 'active') {
    const gym = membership.gymAccess;
    // A trainer of a gym gets the gym's dates and per-trainer client limit (a trainer has no trainers of their own).
    const plan: Plan = { kind: 'trainer', maxClients: gym.plan.maxClients, maxTrainers: null, expiresAt: gym.plan.expiresAt };
    return { status: gym.status, plan, viaGym: true };
  }
  // Pending or removed: only the owner's own approval counts.
  if (own.status === 'approved' || own.status === 'expired') return own;
  return { ...own, status: membership.status === 'removed' ? 'disabled' : 'pending' };
}

/** Whether a gym may approve one more trainer. */
export function canAddTrainer(plan: Plan, activeTrainers: number): boolean {
  return plan.maxTrainers === null || activeTrainers < plan.maxTrainers;
}
