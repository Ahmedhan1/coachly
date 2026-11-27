import { describe, expect, it } from 'vitest';
import { addActivity, markActivitySeen, parseActivity, unseenActivity, ACTIVITY_MAX, type ActivityEvent } from './activity';

const ev = (id: string, at: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({ id, kind: 'checkin', clientId: 'c1', at, seen: false, ...extra });

describe('client activity inbox', () => {
  it('adds new events newest first and ignores ids it already has', () => {
    const list = addActivity([ev('a', 1)], [ev('b', 3), ev('a', 9)]);
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
    expect(list[1]?.at).toBe(1);
  });

  it('keeps at most ACTIVITY_MAX events', () => {
    const many = Array.from({ length: ACTIVITY_MAX + 5 }, (_, i) => ev(`e${i}`, i));
    const list = addActivity([], many);
    expect(list).toHaveLength(ACTIVITY_MAX);
    expect(list[0]?.id).toBe(`e${ACTIVITY_MAX + 4}`);
  });

  it('marks some or all events seen', () => {
    const list = [ev('a', 2), ev('b', 1)];
    expect(unseenActivity(markActivitySeen(list, ['a'])).map((e) => e.id)).toEqual(['b']);
    expect(unseenActivity(markActivitySeen(list, 'all'))).toEqual([]);
  });

  it('marks every event of one client seen', () => {
    const list = [ev('a', 2, { clientId: 'x' }), ev('b', 1)];
    expect(unseenActivity(markActivitySeen(list, { clientId: 'x' })).map((e) => e.id)).toEqual(['b']);
  });

  it('parses stored data and drops anything malformed', () => {
    expect(parseActivity(null)).toEqual([]);
    expect(parseActivity([ev('a', 1, { note: 'hi' }), { id: 1 }, ev('b', 2, { kind: 'photo' })]).map((e) => e.id)).toEqual(['b', 'a']);
    expect(parseActivity([{ ...ev('a', 1), kind: 'nope' }])).toEqual([]);
  });

  it('cuts long notes', () => {
    expect(addActivity([], [ev('a', 1, { note: 'x'.repeat(500) })])[0]?.note).toHaveLength(140);
  });
});
