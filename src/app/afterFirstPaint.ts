/** Runs `task` when the browser is idle after the next paint (setTimeout where requestIdleCallback is missing, e.g. Safari). */
export function afterFirstPaint(task: () => void, win: Pick<Window, 'setTimeout' | 'clearTimeout'> & Partial<Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>> = window): () => void {
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(task, { timeout: 5000 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = win.setTimeout(task, 1500);
  return () => win.clearTimeout(id);
}
