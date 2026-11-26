/**
 * Owner-entered dates are Cairo calendar days. A plan "until 2027-01-31" ends when 2027-02-01 starts in Cairo.
 * Egypt observes daylight saving time again (since 2023), so the offset comes from Intl, never a constant.
 */
function cairoOffsetSeconds(utcSeconds: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcSeconds * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) / 1000;
  return asUtc - utcSeconds;
}

/** Unix seconds when the Cairo day after `isoDate` (YYYY-MM-DD) begins, or null for a malformed date. */
export function endOfCairoDay(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const nextMidnightAsUtc = Date.UTC(y, mo - 1, d + 1) / 1000;
  // Two passes settle the offset even on a DST switch day.
  let guess = nextMidnightAsUtc - cairoOffsetSeconds(nextMidnightAsUtc);
  guess = nextMidnightAsUtc - cairoOffsetSeconds(guess);
  return guess;
}
