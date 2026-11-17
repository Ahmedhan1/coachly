import { describe, expect, it } from 'vitest';
import { reloadOnceAfterChunkError, scheduleUpdateChecks, UPDATE_CHECK_INTERVAL_MS, UPDATE_CHECK_MIN_GAP_MS, type UpdateCheckDeps } from './swUpdate';

function harness(start = 1_000_000) {
  let now = start;
  let online = true;
  let visible = true;
  let onVisible: (() => void) | null = null;
  let tick: (() => void) | null = null;
  let interval = 0;
  let updates = 0;
  let stopped = 0;
  const deps: UpdateCheckDeps = {
    now: () => now,
    isOnline: () => online,
    isVisible: () => visible,
    onVisible: (l) => {
      onVisible = l;
      return () => stopped++;
    },
    every: (ms, fn) => {
      interval = ms;
      tick = fn;
      return () => stopped++;
    },
  };
  const reg = {
    update: () => {
      updates++;
      return Promise.reject(new Error('network'));
    },
  };
  return {
    stop: scheduleUpdateChecks(reg, deps),
    advance: (ms: number) => (now += ms),
    setOnline: (v: boolean) => (online = v),
    setVisible: (v: boolean) => (visible = v),
    foreground: () => onVisible?.(),
    tick: () => tick?.(),
    get updates() {
      return updates;
    },
    get interval() {
      return interval;
    },
    get stopped() {
      return stopped;
    },
  };
}

describe('scheduleUpdateChecks', () => {
  it('checks when the app returns to the foreground, at most every 30 minutes', () => {
    const h = harness();
    h.foreground();
    expect(h.updates).toBe(0); // registration just checked
    h.advance(UPDATE_CHECK_MIN_GAP_MS);
    h.foreground();
    expect(h.updates).toBe(1);
    h.advance(60_000);
    h.foreground();
    expect(h.updates).toBe(1);
  });

  it('checks hourly while visible, never offline or in the background, and a failed check is silent', () => {
    const h = harness();
    expect(h.interval).toBe(UPDATE_CHECK_INTERVAL_MS);
    h.advance(UPDATE_CHECK_INTERVAL_MS);
    h.setOnline(false);
    h.tick();
    expect(h.updates).toBe(0);
    h.setOnline(true);
    h.setVisible(false);
    h.tick();
    expect(h.updates).toBe(0);
    h.setVisible(true);
    h.tick();
    expect(h.updates).toBe(1);
  });

  it('stops both triggers', () => {
    const h = harness();
    h.stop();
    expect(h.stopped).toBe(2);
  });
});

describe('reloadOnceAfterChunkError', () => {
  it('reloads once, then not again within a minute', () => {
    let stored: string | null = null;
    let reloads = 0;
    let now = 5_000_000;
    const deps = { now: () => now, read: () => stored, write: (v: string) => (stored = v), reload: () => reloads++ };
    expect(reloadOnceAfterChunkError(deps)).toBe(true);
    now += 10_000;
    expect(reloadOnceAfterChunkError(deps)).toBe(false);
    now += 60_000;
    expect(reloadOnceAfterChunkError(deps)).toBe(true);
    expect(reloads).toBe(2);
  });

  it('still reloads when storage is unavailable', () => {
    let reloads = 0;
    expect(reloadOnceAfterChunkError({ now: () => 1, read: () => null, write: () => undefined, reload: () => reloads++ })).toBe(true);
    expect(reloads).toBe(1);
  });
});
