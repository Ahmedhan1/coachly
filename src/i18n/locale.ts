/**
 * Active UI language. Arabic is the default; English is opt-in from Settings.
 * The choice lives in localStorage so it is known before the app renders; switching reloads the page
 * so every module-level string and the document direction follow the new language at once.
 */
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const KEY = 'pt.locale';

function read(): Locale {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

let current: Locale = read();

export function getLocale(): Locale {
  return current;
}

export const isEnglish = (): boolean => current === 'en';

/** Text direction for the active language. */
export const localeDir = (locale: Locale = current): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr');

/** Picks the English variant when English is active and one exists, otherwise the Arabic one. */
export function pick<T>(arValue: T, enValue: T | undefined | null): T {
  return current === 'en' && enValue !== undefined && enValue !== null && enValue !== '' ? enValue : arValue;
}

/** Applies lang/dir to <html>. Called once at start-up. */
export function applyDocumentLocale(doc: Document = document): void {
  doc.documentElement.lang = current;
  doc.documentElement.dir = localeDir();
  // index.html carries the app name with an Arabic descriptor; English shows the brand alone.
  if (current === 'en') doc.title = 'Coachly';
}

/** Saves the choice and reloads so the whole UI switches. Tests may pass reload = false. */
export function setLocale(locale: Locale, reload = true): void {
  try {
    globalThis.localStorage?.setItem(KEY, locale);
  } catch {
    /* storage blocked: still switch for this session */
  }
  current = locale;
  if (reload && typeof location !== 'undefined') location.reload();
}

/** Test helper: switch without touching storage or reloading. */
export function setLocaleForTests(locale: Locale): void {
  current = locale;
}
