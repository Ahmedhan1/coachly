import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterFirstPaint } from './afterFirstPaint';

afterEach(() => vi.useRealTimers());

describe('afterFirstPaint', () => {
  it('waits the minimum delay, then the next idle period; cancelling stops it', () => {
    vi.useFakeTimers();
    let idle: (() => void) | null = null;
    const requestIdleCallback = vi.fn((cb: () => void) => {
      idle = cb;
      return 7;
    });
    const cancelIdleCallback = vi.fn();
    const task = vi.fn();
    const stop = afterFirstPaint(task, { requestIdleCallback, cancelIdleCallback, setTimeout, clearTimeout } as never, 1000);
    vi.advanceTimersByTime(999);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).not.toHaveBeenCalled();
    (idle as (() => void) | null)?.();
    expect(task).toHaveBeenCalledOnce();
    stop();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
  it('without requestIdleCallback (Safari) runs right after the delay', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const stop = afterFirstPaint(task, { setTimeout, clearTimeout } as never, 1000);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledOnce();
    stop();
  });
  it('is cancelled before the delay ends', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    afterFirstPaint(task, { setTimeout, clearTimeout } as never, 1000)();
    vi.advanceTimersByTime(2000);
    expect(task).not.toHaveBeenCalled();
  });
});
