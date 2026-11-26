import { describe, expect, it } from 'vitest';
import type { ClientId } from '@/domain/models';
import { buildRoster, inviteLink, parseRoster, readJoinFragment, teamTotals, type Roster } from './team';

const cid = (id: string) => id as ClientId;

const NOW = new Date('2026-11-26T10:00:00Z');
const client = (over: Partial<Parameters<typeof buildRoster>[0]['clients'][number]> = {}) => ({
  id: cid('c1'),
  name: 'سارة محمود',
  goal: 'fat_loss' as const,
  package: { name: 'باقة 12', totalSessions: 12, priceMinor: 0, currency: 'EGP' as const },
  remainingSessions: 5,
  startDate: '2026-11-01',
  endDate: '2026-12-01',
  ...over,
});

describe('buildRoster', () => {
  it('summarises each client: package, sessions left, dates, last attended session, attention', () => {
    const roster = buildRoster({
      trainerName: 'كابتن كريم',
      clients: [client(), client({ id: cid('c2'), name: 'أحمد', package: null, remainingSessions: 0, startDate: null, endDate: '2026-11-20' })],
      sessions: [
        { clientId: cid('c1'), startsAt: Date.parse('2026-11-20T16:00:00Z'), attendance: 'attended' },
        { clientId: cid('c1'), startsAt: Date.parse('2026-11-24T16:00:00Z'), attendance: 'attended' },
        { clientId: cid('c1'), startsAt: Date.parse('2026-11-28T16:00:00Z'), attendance: 'scheduled' },
        { clientId: cid('c1'), startsAt: Date.parse('2026-11-25T16:00:00Z'), attendance: 'missed' },
      ],
      today: '2026-11-26',
      now: NOW,
    });
    expect(roster).toEqual({
      v: 1,
      trainerName: 'كابتن كريم',
      generatedAt: NOW.getTime(),
      clients: [
        {
          name: 'سارة محمود',
          goal: 'fat_loss',
          packageName: 'باقة 12',
          totalSessions: 12,
          remainingSessions: 5,
          startDate: '2026-11-01',
          endDate: '2026-12-01',
          lastSessionAt: Date.parse('2026-11-24T16:00:00Z'),
          attention: 'ending_soon',
        },
        { name: 'أحمد', goal: 'fat_loss', packageName: null, totalSessions: 0, remainingSessions: 0, startDate: null, endDate: '2026-11-20', lastSessionAt: null, attention: 'ended' },
      ],
    });
  });

  it('never includes phone numbers, notes, measurements or photos (only what the gym needs)', () => {
    const roster = buildRoster({ trainerName: 'x', clients: [{ ...client(), phone: '01012345678', notes: 'سر', measurements: { weightKg: 80 } } as never], sessions: [], today: '2026-11-26', now: NOW });
    const text = JSON.stringify(roster);
    expect(text).not.toContain('01012345678');
    expect(text).not.toContain('سر');
    expect(text).not.toContain('weightKg');
  });
});

describe('parseRoster', () => {
  it('round-trips and rejects junk', () => {
    const roster: Roster = buildRoster({ trainerName: 'x', clients: [client()], sessions: [], today: '2026-11-26', now: NOW });
    expect(parseRoster(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
    expect(parseRoster({ v: 2 })).toBeNull();
    expect(parseRoster('x')).toBeNull();
  });
});

describe('teamTotals', () => {
  it('counts trainers, clients and clients needing attention', () => {
    const a = buildRoster({ trainerName: 'a', clients: [client(), client({ id: cid('c3'), endDate: null, remainingSessions: 9 })], sessions: [], today: '2026-11-26', now: NOW });
    const b = buildRoster({ trainerName: 'b', clients: [client({ endDate: '2026-11-01' })], sessions: [], today: '2026-11-26', now: NOW });
    expect(teamTotals([a, b])).toEqual({ trainers: 2, clients: 3, needAttention: 2 });
  });
});

describe('invite link', () => {
  it('carries the code and the team key in the fragment only', () => {
    const link = inviteLink('https://app.example', 'CODE_abcdefghijklmn', 'KEY-abcdefghijklmnopqrstuvwxyz0123456789ABCDE');
    expect(link).toBe('https://app.example/#join=CODE_abcdefghijklmn.KEY-abcdefghijklmnopqrstuvwxyz0123456789ABCDE');
    expect(readJoinFragment(new URL(link).hash)).toEqual({ code: 'CODE_abcdefghijklmn', key: 'KEY-abcdefghijklmnopqrstuvwxyz0123456789ABCDE' });
  });

  it('ignores other fragments and malformed invites', () => {
    expect(readJoinFragment('#auth=abc')).toBeNull();
    expect(readJoinFragment('#join=nodot')).toBeNull();
    expect(readJoinFragment('#join=bad code.key')).toBeNull();
    expect(readJoinFragment('')).toBeNull();
  });
});
