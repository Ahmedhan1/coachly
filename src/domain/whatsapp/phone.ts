/**
 * Phone input for Egyptian trainers: Arabic keyboards type ٠-٩, numbers are written locally (010…) or
 * internationally (+20 …). Pure helpers; the wa.me normalisation lives in ./templates.
 */

/** ٠-٩ (Arabic-Indic) and ۰-۹ (Persian) → 0-9. Everything else is kept. */
export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** What the phone field keeps while typing: Western digits, +, spaces and dashes. */
export function cleanPhoneInput(s: string): string {
  return toWesternDigits(s).replace(/[^0-9+\s-]/g, '');
}

export type PhoneProblem = 'egypt_mobile' | 'too_short' | 'too_long';

const EG_MOBILE = /^1[0125]\d{8}$/;

/**
 * Why a phone cannot be used for calls / WhatsApp, or null when it is fine (an empty phone is fine: it is
 * optional). Egyptian mobiles must be 01[0,1,2,5] + 8 digits; landlines (02…, 03…) and foreign numbers
 * written with + or 00 are accepted by length.
 */
export function phoneProblem(phone: string): PhoneProblem | null {
  const trimmed = toWesternDigits(phone).trim();
  if (trimmed === '') return null;
  let digits = trimmed.replace(/\D/g, '');
  const international = trimmed.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international) {
    if (digits.startsWith('20')) {
      const national = digits.slice(2).replace(/^0/, '');
      if (national.startsWith('1')) return EG_MOBILE.test(national) ? null : 'egypt_mobile';
      return national.length >= 8 && national.length <= 9 ? null : national.length < 8 ? 'too_short' : 'too_long';
    }
    if (digits.length < 8) return 'too_short';
    return digits.length > 15 ? 'too_long' : null;
  }
  if (digits.startsWith('01')) return EG_MOBILE.test(digits.slice(1)) ? null : 'egypt_mobile';
  if (digits.startsWith('1') && digits.length >= 9) return EG_MOBILE.test(digits) ? null : 'egypt_mobile';
  if (digits.length < 8) return 'too_short';
  return digits.length > 15 ? 'too_long' : null;
}
