import { describe, expect, it } from 'vitest';
import { canAddTrainer, DEFAULT_PLAN, resolveAccess, type Access, type Plan } from '../src/team/access';

const NOW = 1_800_000_000;
const gymPlan: Plan = { kind: 'gym', maxClients: 40, maxTrainers: 3, expiresAt: NOW + 86_400 };
const gymOk: Access = { status: 'approved', plan: gymPlan, viaGym: false };

describe('resolveAccess', () => {
  it('independent trainer: the owner decides; no plan means no limits', () => {
    expect(resolveAccess({ status: 'pending', plan: null, membership: null, now: NOW })).toEqual({ status: 'pending', plan: DEFAULT_PLAN, viaGym: false });
    expect(resolveAccess({ status: 'approved', plan: null, membership: null, now: NOW }).status).toBe('approved');
  });

  it('an approved account past its end date is expired; pending stays pending', () => {
    const plan: Plan = { ...DEFAULT_PLAN, expiresAt: NOW };
    expect(resolveAccess({ status: 'approved', plan, membership: null, now: NOW }).status).toBe('expired');
    expect(resolveAccess({ status: 'approved', plan, membership: null, now: NOW - 1 }).status).toBe('approved');
    expect(resolveAccess({ status: 'pending', plan, membership: null, now: NOW }).status).toBe('pending');
  });

  it('active gym trainer: the gym decides, with the gym dates and per-trainer client limit', () => {
    const access = resolveAccess({ status: 'pending', plan: null, membership: { status: 'active', gymAccess: gymOk }, now: NOW });
    expect(access).toEqual({ status: 'approved', plan: { kind: 'trainer', maxClients: 40, maxTrainers: null, expiresAt: NOW + 86_400 }, viaGym: true });
    for (const status of ['expired', 'disabled', 'pending'] as const) {
      const gymAccess = { ...gymOk, status };
      expect(resolveAccess({ status: 'pending', plan: null, membership: { status: 'active', gymAccess }, now: NOW }).status).toBe(status);
    }
  });

  it('the owner disabling an account wins over any gym', () => {
    expect(resolveAccess({ status: 'disabled', plan: null, membership: { status: 'active', gymAccess: gymOk }, now: NOW }).status).toBe('disabled');
  });

  it('pending or removed from a gym: only the owner approval counts', () => {
    const pending = { status: 'pending' as const, gymAccess: gymOk };
    const removed = { status: 'removed' as const, gymAccess: gymOk };
    expect(resolveAccess({ status: 'pending', plan: null, membership: pending, now: NOW }).status).toBe('pending');
    expect(resolveAccess({ status: 'pending', plan: null, membership: removed, now: NOW }).status).toBe('disabled');
    expect(resolveAccess({ status: 'approved', plan: null, membership: removed, now: NOW })).toMatchObject({ status: 'approved', viaGym: false });
  });
});

describe('canAddTrainer', () => {
  it('respects the gym trainer limit', () => {
    expect(canAddTrainer(gymPlan, 2)).toBe(true);
    expect(canAddTrainer(gymPlan, 3)).toBe(false);
    expect(canAddTrainer({ ...gymPlan, maxTrainers: null }, 999)).toBe(true);
  });
});
