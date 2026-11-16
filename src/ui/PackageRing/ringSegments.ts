export type SegmentState = 'used' | 'booked' | 'left';

/**
 * Splits a package into `count` ring segments (default 12): used sessions first, then one "booked" segment
 * when the next session is already scheduled, then what is left. Proportional when total ≠ count.
 */
export function ringSegments(total: number, remaining: number, booked: boolean, count = 12): SegmentState[] {
  if (total <= 0) return Array<SegmentState>(count).fill('left');
  const left = Math.min(Math.max(remaining, 0), total);
  const used = Math.round(((total - left) / total) * count);
  const bookedSegments = booked && left > 0 ? 1 : 0;
  // keep at least one "left" segment visible while sessions remain
  const usedClamped = left > 0 ? Math.min(used, count - 1 - bookedSegments) : count;
  return Array.from({ length: count }, (_, i) => {
    if (i < usedClamped) return 'used';
    if (i < usedClamped + bookedSegments) return 'booked';
    return 'left';
  });
}
