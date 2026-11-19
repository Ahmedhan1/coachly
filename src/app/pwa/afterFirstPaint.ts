type IdleWindow = Pick<Window, 'setTimeout' | 'clearTimeout'> & Partial<Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>>;

/**
 * Runs `task` once the app has settled: `minDelayMs` after the first paint, then in the next idle period
 * (requestIdleCallback; Safari lacks it, so there it runs right after the delay). Used for housekeeping
 * (the daily purge) whose IndexedDB transactions must not queue ahead of the trainer's first taps.
 */
export function afterFirstPaint(task: () => void, win: IdleWindow = window, minDelayMs = 4000): () => void {
  let idleId: number | null = null;
  const timer = win.setTimeout(() => {
    if (typeof win.requestIdleCallback === 'function') idleId = win.requestIdleCallback(task, { timeout: 5000 });
    else task();
  }, minDelayMs);
  return () => {
    win.clearTimeout(timer);
    if (idleId !== null) win.cancelIdleCallback?.(idleId);
  };
}
