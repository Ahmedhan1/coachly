import { describe, expect, it, vi } from 'vitest';
import { afterFirstPaint } from './afterFirstPaint';

describe('afterFirstPaint', () => {
  it('uses requestIdleCallback when present and can be cancelled', () => {
    const requestIdleCallback = vi.fn((cb: () => void) => {
      cb();
      return 7;
    });
    const cancelIdleCallback = vi.fn();
    const task = vi.fn();
    const stop = afterFirstPaint(task, { requestIdleCallback, cancelIdleCallback, setTimeout, clearTimeout } as never);
    expect(task).toHaveBeenCalledOnce();
    stop();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
  it('falls back to a timeout (Safari has no requestIdleCallback)', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    afterFirstPaint(task, { setTimeout, clearTimeout } as never);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(task).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
