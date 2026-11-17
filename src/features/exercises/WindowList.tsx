import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface WindowListProps<T> {
  items: readonly T[];
  rowHeight: number;
  getKey: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  label: string;
  /** Extra rows rendered above and below the viewport. */
  overscan?: number;
  className?: string;
}

interface Range {
  start: number;
  end: number;
}

/**
 * Windowed list over the page (window) scroll with fixed row heights: only the rows near the viewport are
 * in the DOM (≈ 20 instead of 876), and scroll handling is one rAF-throttled range check.
 */
export function WindowList<T>({ items, rowHeight, getKey, renderRow, label, overscan = 6, className }: WindowListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>({ start: 0, end: 16 });

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const start = Math.max(0, Math.floor(-top / rowHeight) - overscan);
      const end = Math.min(items.length, Math.ceil((window.innerHeight - top) / rowHeight) + overscan);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items.length, rowHeight, overscan]);

  const start = Math.min(range.start, items.length);
  const visible = items.slice(start, Math.max(start, range.end));
  return (
    <div ref={ref} role="list" aria-label={label} className={className} style={{ position: 'relative', blockSize: items.length * rowHeight }}>
      {visible.map((item, i) => (
        <div
          key={getKey(item)}
          role="listitem"
          aria-posinset={start + i + 1}
          aria-setsize={items.length}
          style={{ position: 'absolute', insetInline: 0, insetBlockStart: (start + i) * rowHeight, blockSize: rowHeight }}
        >
          {renderRow(item)}
        </div>
      ))}
    </div>
  );
}
