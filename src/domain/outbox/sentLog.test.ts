import { describe, expect, it } from 'vitest';
import { SENT_LOG_MAX_AGE_MS, SENT_LOG_MAX_ENTRIES, updateSentLog } from './sentLog';

const DAY = 86_400_000;

describe('updateSentLog', () => {
  it('adds and removes an id', () => {
    const added = updateSentLog([], 'a', true, 1000);
    expect(added).toEqual([{ id: 'a', at: 1000 }]);
    expect(updateSentLog(added, 'a', false, 2000)).toEqual([]);
  });

  it('replaces an existing entry instead of duplicating it', () => {
    expect(updateSentLog([{ id: 'a', at: 1 }], 'a', true, 5)).toEqual([{ id: 'a', at: 5 }]);
  });

  it('drops entries older than the max age', () => {
    const now = 200 * DAY;
    const log = [{ id: 'old', at: now - SENT_LOG_MAX_AGE_MS - 1 }, { id: 'new', at: now - DAY }];
    expect(updateSentLog(log, 'x', true, now).map((e) => e.id)).toEqual(['new', 'x']);
  });

  it('never grows past the entry cap, keeping the newest', () => {
    const now = 10 * DAY;
    const log = Array.from({ length: SENT_LOG_MAX_ENTRIES + 50 }, (_, i) => ({ id: `id${i}`, at: now - DAY + i }));
    const next = updateSentLog(log, 'last', true, now);
    expect(next).toHaveLength(SENT_LOG_MAX_ENTRIES);
    expect(next[next.length - 1]).toEqual({ id: 'last', at: now });
    expect(next.some((e) => e.id === 'id0')).toBe(false);
  });

  it('keeps entries with a future timestamp (clock moved back) bounded by the cap only', () => {
    expect(updateSentLog([{ id: 'f', at: 10 * DAY }], 'x', true, DAY).map((e) => e.id)).toEqual(['f', 'x']);
  });
});
