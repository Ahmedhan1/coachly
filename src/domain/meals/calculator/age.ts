/** Whole years between a `YYYY-MM-DD` birth date and `today` (also `YYYY-MM-DD`). Null when invalid. */
export function ageInYears(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate) return null;
  const parse = (s: string) => s.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = parse(birthDate);
  const [ty, tm, td] = parse(today);
  if (![by, bm, bd, ty, tm, td].every(Number.isFinite)) return null;
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 ? age : null;
}
