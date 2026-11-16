/**
 * Input mask for the short activation code: upper-cases, drops anything that is not a letter or
 * digit, groups as XXXX-XXXX-XXXX (max 12 chars). Alphabet validation belongs to shared/license.ts.
 */
export function formatActivationCodeInput(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return chars.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isCompleteActivationCode(formatted: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(formatted);
}
