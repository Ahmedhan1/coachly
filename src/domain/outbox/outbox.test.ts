import { describe, expect, it } from 'vitest';
import { buildOutbox, type OutboxClient, type OutboxInput } from './outbox';

const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const client = (over: Partial<OutboxClient> = {}): OutboxClient => ({
  id: 'c1', name: 'سارة', phone: '01000000000', birthDate: null, endDate: '2026-12-30', remainingSessions: 8, hasPackage: true, createdOn: '2026-10-01', ...over,
});
const base = (over: Partial<OutboxInput> = {}): OutboxInput => ({
  today: '2026-11-16', dateOf, clients: [client()], sessions: [], payments: [], lastCheckIn: new Map([['c1', '2026-11-14']]), sent: new Set(), ...over,
});

describe('buildOutbox', () => {
  it('reminds about tomorrow’s scheduled sessions only', () => {
    const items = buildOutbox(base({ sessions: [
      { id: 's1', clientId: 'c1', startsAt: Date.parse('2026-11-17T15:00:00Z'), attendance: 'scheduled' },
      { id: 's2', clientId: 'c1', startsAt: Date.parse('2026-11-18T15:00:00Z'), attendance: 'scheduled' },
      { id: 's3', clientId: 'c1', startsAt: Date.parse('2026-11-17T18:00:00Z'), attendance: 'cancelled' },
    ] }));
    expect(items.map((i) => i.id)).toEqual(['session_reminder:s1']);
  });

  it('renewal near the end date, payments due, birthdays, welcome and check-in reminders', () => {
    const items = buildOutbox(base({
      clients: [
        client({ id: 'a', endDate: '2026-11-18' }),
        client({ id: 'b', birthDate: '1990-11-16' }),
        client({ id: 'n', createdOn: '2026-11-15' }),
        client({ id: 'q' }),
      ],
      lastCheckIn: new Map([['a', '2026-11-15'], ['b', '2026-11-15'], ['n', '2026-11-15'], ['q', '2026-11-01']]),
      payments: [{ id: 'p1', clientId: 'b', status: 'due', dueOn: '2026-11-10', amountMinor: 150000 }],
    }));
    const kinds = items.map((i) => `${i.kind}:${i.clientId}`);
    expect(kinds).toEqual(['payment_due:b', 'renewal:a', 'checkin_reminder:q', 'birthday:b', 'welcome:n']);
    expect(items.find((i) => i.kind === 'renewal')?.daysLeft).toBe(2);
    expect(items.find((i) => i.kind === 'payment_due')?.amountMinor).toBe(150000);
  });

  it('renewal by low sessions reports sessions left; demo clients are not welcomed', () => {
    const items = buildOutbox(base({ clients: [client({ remainingSessions: 1 }), client({ id: 'd', createdOn: '2026-11-16', isDemo: true })], lastCheckIn: new Map([['c1', '2026-11-15'], ['d', '2026-11-15']]) }));
    expect(items).toEqual([{ id: 'renewal:c1:2026-12-30', kind: 'renewal', clientId: 'c1', sessionsLeft: 1 }]);
  });

  it('drops sent items, disabled kinds and clients without a phone', () => {
    const input = base({ clients: [client({ endDate: '2026-11-17' }), client({ id: 'x', phone: ' ', endDate: '2026-11-17' })] });
    expect(buildOutbox(input).map((i) => i.id)).toEqual(['renewal:c1:2026-11-17']);
    expect(buildOutbox({ ...input, sent: new Set(['renewal:c1:2026-11-17']) })).toEqual([]);
    expect(buildOutbox({ ...input, enabled: new Set(['birthday']) })).toEqual([]);
  });
});
