import { describe, expect, it } from 'vitest';
import { PUSH_RESEND_MS, SYNC_MIN_GAP_MS, shouldRunSync, shouldSendPushSchedule } from './syncThrottle';

describe('shouldRunSync', () => {
  const now = 1_000_000_000;
  it('always runs at start and when the network comes back', () => {
    expect(shouldRunSync('start', now - 1000, now)).toBe(true);
    expect(shouldRunSync('online', now - 1000, now)).toBe(true);
  });
  it('runs on a foreground return only after the minimum gap', () => {
    expect(shouldRunSync('visible', now - SYNC_MIN_GAP_MS + 1, now)).toBe(false);
    expect(shouldRunSync('visible', now - SYNC_MIN_GAP_MS, now)).toBe(true);
    expect(shouldRunSync('timer', now - 60_000, now)).toBe(false);
  });
  it('runs when it never ran', () => {
    expect(shouldRunSync('visible', null, now)).toBe(true);
  });
});

describe('shouldSendPushSchedule', () => {
  const now = 2_000_000_000;
  it('sends the first time and when the schedule changed', () => {
    expect(shouldSendPushSchedule({ fingerprint: 'a', last: null, now })).toBe(true);
    expect(shouldSendPushSchedule({ fingerprint: 'b', last: { fingerprint: 'a', at: now - 1000 }, now })).toBe(true);
  });
  it('skips an unchanged schedule until it is old enough to refresh', () => {
    expect(shouldSendPushSchedule({ fingerprint: 'a', last: { fingerprint: 'a', at: now - 1000 }, now })).toBe(false);
    expect(shouldSendPushSchedule({ fingerprint: 'a', last: { fingerprint: 'a', at: now - PUSH_RESEND_MS }, now })).toBe(true);
  });
});
