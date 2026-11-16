/** Western digits (0-9) always; at most `decimals` places, trailing zeros dropped. */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '';
  const fixed = n.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  const [int, frac] = trimmed.split('.');
  const grouped = (int ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Whole years between two ISO dates (birthday-aware), or null. */
export function ageOn(birthDate: string | null, on: string): number | null {
  if (!birthDate) return null;
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(on);
  if (!b || !d) return null;
  let age = Number(d[1]) - Number(b[1]);
  if (d[2]! + d[3]! < b[2]! + b[3]!) age -= 1;
  return age >= 0 ? age : null;
}

/** The trainer's disclaimer text, or the default when they left it empty. */
export function resolveDisclaimer(custom: string | null | undefined, defaultText: string): string {
  const t = (custom ?? '').trim();
  return t.length > 0 ? t : defaultText;
}

/**
 * A signed number wrapped in Unicode LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE so the sign stays in
 * front of the digits inside Arabic (RTL) text: "(-3.5)" instead of "(3.5-)".
 */
export function signedLtr(n: number, decimals = 0, suffix = ''): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `\u2066${sign}${formatNumber(Math.abs(n), decimals)}${suffix}\u2069`;
}
