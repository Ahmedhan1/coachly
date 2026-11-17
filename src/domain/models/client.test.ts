import { describe, expect, it } from 'vitest';
import { clientSchema } from './client';
import { meta } from './testFixtures';

const base = {
  id: 'c1',
  name: '  سارة محمود  ',
  phone: '+20 100 123 4567',
  gender: 'female',
  birthDate: null,
  goal: 'fat_loss',
  goalNote: '',
  injuries: ['ركبة شمال'],
  measurements: { weightKg: 72.5, heightCm: 165 },
  package: { name: '12 حصة', totalSessions: 12, priceMinor: 300_000, currency: 'EGP' },
  startDate: '2026-11-01',
  endDate: '2026-12-01',
  remainingSessions: 8,
  notes: '',
  photoId: null,
  ...meta(),
};

describe('clientSchema', () => {
  it('accepts a full client and trims the name', () => {
    const parsed = clientSchema.parse(base);
    expect(parsed.name).toBe('سارة محمود');
  });
  it('rejects a blank name', () => {
    expect(clientSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });
  it('rejects letters in the phone number', () => {
    expect(clientSchema.safeParse({ ...base, phone: '010abc' }).success).toBe(false);
  });
  it('rejects an end date before the start date', () => {
    const r = clientSchema.safeParse({ ...base, endDate: '2026-10-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['endDate']);
  });
  it('allows a client with no package or dates', () => {
    expect(clientSchema.safeParse({ ...base, package: null, startDate: null, endDate: null }).success).toBe(true);
  });
  it('rejects negative remaining sessions and fractional price', () => {
    expect(clientSchema.safeParse({ ...base, remainingSessions: -1 }).success).toBe(false);
    expect(
      clientSchema.safeParse({ ...base, package: { ...base.package, priceMinor: 10.5 } }).success,
    ).toBe(false);
  });
  it('requires soft-delete marker to be null or a timestamp', () => {
    expect(clientSchema.safeParse({ ...base, deletedAt: 5 }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, deletedAt: undefined }).success).toBe(false);
  });
  it('rejects impossible measurements', () => {
    expect(clientSchema.safeParse({ ...base, measurements: { weightKg: -3 } }).success).toBe(false);
    expect(clientSchema.safeParse({ ...base, measurements: { bodyFatPercent: 90 } }).success).toBe(false);
  });
});
