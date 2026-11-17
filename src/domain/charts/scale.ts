/** Maps [d0, d1] linearly onto [r0, r1]. A zero-width domain maps everything to the range midpoint. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (x) => r0 + (x - d0) * k;
}

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` date (timezone-independent). */
export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Inverse of dayNumber. */
export function isoFromDay(day: number): string {
  const date = new Date(day * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
