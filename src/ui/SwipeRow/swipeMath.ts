/**
 * Pure swipe geometry. `dx` is the raw pointer delta (px, screen coordinates).
 * Revealing the trailing action means moving toward the inline-start side:
 * left in LTR (negative dx), right in RTL (positive dx). Returns the reveal distance >= 0.
 */
export function revealDistance(dx: number, rtl: boolean, startOffset: number, max: number): number {
  const toward = rtl ? dx : -dx;
  return Math.min(Math.max(startOffset + toward, 0), max);
}

export type SwipeOutcome = 'closed' | 'open' | 'delete';

/** Where the row settles on release. */
export function settle(distance: number, actionWidth: number, rowWidth: number): SwipeOutcome {
  if (distance >= rowWidth * 0.6) return 'delete';
  if (distance >= actionWidth / 2) return 'open';
  return 'closed';
}
