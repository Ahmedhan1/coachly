/**
 * wa.me link for a client's phone. Egyptian local numbers (01xxxxxxxxx) get the 20 country code;
 * numbers typed with + or 00 keep theirs. Returns null when there are too few digits to be a phone.
 */
export function whatsappUrl(phone: string, defaultCountryCode = '20'): string | null {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  }
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
