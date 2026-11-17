/** 100 million in major units: far above any trainer price, far below where sums of many charges lose precision. */
export const MAX_MONEY_MINOR = 100_000_000 * 100;

/** "3,000" / "٣٠٠٠" / "2500.5" typed by the trainer → integer minor units (null when not a positive amount). */
export function parseMoneyInput(text: string): number | null {
  const western = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫]/g, '.')
    .replace(/[,٬\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(western)) return null;
  const minor = Math.round(Number(western) * 100);
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_MONEY_MINOR ? minor : null;
}

/** Minor units → the plain number shown in an input ("3000", "2500.5"). */
export function moneyInputValue(minor: number): string {
  return minor > 0 ? String(minor / 100) : '';
}
