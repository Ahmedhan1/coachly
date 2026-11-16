export type SegmentState = 'left' | 'used';

/**
 * Splits a package into `count` ring segments (default 12): the sessions still LEFT first (drawn in the
 * brand colour, starting at 12 o'clock and running right-to-left across the top), then the USED ones
 * (neutral). Proportional when total ≠ count; while any session remains at least one segment is "left",
 * and while any session was used at least one is "used", so the ring never overstates either.
 */
export function ringSegments(total: number, remaining: number, count = 12): SegmentState[] {
  if (total <= 0) return Array<SegmentState>(count).fill('used');
  const left = Math.min(Math.max(remaining, 0), total);
  let leftSegments = Math.round((left / total) * count);
  if (left > 0) leftSegments = Math.max(1, leftSegments);
  if (left < total) leftSegments = Math.min(count - 1, leftSegments);
  return Array.from({ length: count }, (_, i) => (i < leftSegments ? 'left' : 'used'));
}
