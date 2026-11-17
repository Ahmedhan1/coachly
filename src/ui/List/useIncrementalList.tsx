import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface IncrementalListOptions {
  /** Rows rendered at first and added each time the end comes near. */
  step?: number;
  /** When this changes (e.g. the search text) the list starts again from one step. */
  resetKey?: unknown;
  /** How far below the viewport the next rows are prepared (CSS margin). */
  rootMargin?: string;
}

/**
 * Renders a long list a page at a time: the first `step` rows, then more whenever an invisible sentinel after
 * the last row comes within `rootMargin` of the viewport. Keeps a 500-client list from building 500 rows (and
 * their swipe handlers) before the first paint. Without IntersectionObserver every row is rendered.
 */
export function useIncrementalList<T>(items: readonly T[], options: IncrementalListOptions = {}): { visible: readonly T[]; sentinel: ReactNode } {
  const step = options.step ?? 40;
  const supported = typeof IntersectionObserver !== 'undefined';
  const [state, setState] = useState({ key: options.resetKey, count: step });
  const count = !supported ? items.length : state.key === options.resetKey ? state.count : step;
  const more = count < items.length;
  const ref = useRef<HTMLDivElement | null>(null);
  const resetKey = options.resetKey;
  const rootMargin = options.rootMargin ?? '600px 0px';

  useEffect(() => {
    const el = ref.current;
    if (!supported || !more || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setState((s) => ({ key: resetKey, count: (s.key === resetKey ? s.count : step) + step }));
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [supported, more, count, resetKey, step, rootMargin]);

  return {
    visible: more ? items.slice(0, count) : items,
    sentinel: more ? <div ref={ref} data-testid="list-sentinel" aria-hidden="true" style={{ blockSize: 1 }} /> : null,
  };
}
