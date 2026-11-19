import { describe, expect, it } from 'vitest';
import { nextAttemptAt, MAX_BACKOFF_MS } from './retry';

describe('nextAttemptAt', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  it('waits 1 minute after the first failure, doubling after each next one', () => {
    expect(nextAttemptAt(1, now) - now.getTime()).toBe(60_000);
    expect(nextAttemptAt(2, now) - now.getTime()).toBe(120_000);
    expect(nextAttemptAt(5, now) - now.getTime()).toBe(16 * 60_000);
  });
  it('never waits more than 6 hours', () => {
    expect(nextAttemptAt(40, now) - now.getTime()).toBe(MAX_BACKOFF_MS);
    expect(MAX_BACKOFF_MS).toBe(6 * 3600_000);
  });
  it('treats 0 or negative attempts as "now"', () => {
    expect(nextAttemptAt(0, now)).toBe(now.getTime());
  });
});
