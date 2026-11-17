import { normalizePhoneForWhatsapp, toWesternDigits } from '@/domain/whatsapp';

/**
 * wa.me link for a client's phone (domain/whatsapp rules: Egyptian 01… gets the 20 country code, +/00
 * numbers keep theirs, Arabic digits are read). Null when it cannot be a phone.
 */
export function whatsappUrl(phone: string): string | null {
  const number = normalizePhoneForWhatsapp(phone);
  return number ? `https://wa.me/${number}` : null;
}

export function telUrl(phone: string): string {
  return `tel:${toWesternDigits(phone).replace(/[^\d+]/g, '')}`;
}
