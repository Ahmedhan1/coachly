import { ar, type Strings } from './ar';
import { en } from './en';
import { getLocale } from './locale';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid translation key, e.g. 'home.addClient'. */
export type TKey = Leaves<Strings>;
export type TParams = Record<string, string | number>;

function find(root: unknown, key: string): string | undefined {
  let node: unknown = root;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Active-language string; English falls back to Arabic for any key not translated yet. */
function lookup(key: string): string {
  if (getLocale() === 'en') {
    const hit = find(en, key);
    if (hit !== undefined) return hit;
  }
  return find(ar, key) ?? key;
}

/** Typed lookup with {placeholder} interpolation. Numbers render with Western digits. */
export function t(key: TKey, params?: TParams): string {
  const template = lookup(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Like t(), but parameters may be any value (e.g. a React node such as <Num>): returns the template split
 * into an array of strings and parameter values, so numbers can be wrapped in an LTR isolate.
 */
export function tParts<T>(key: TKey, params: Record<string, T | string | number>): Array<T | string> {
  const template = lookup(key);
  const out: Array<T | string> = [];
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const name = match[1] ?? '';
    if (!(name in params)) continue;
    const at = match.index ?? 0;
    if (at > last) out.push(template.slice(last, at));
    const value = params[name] as T | string | number;
    out.push(typeof value === 'number' ? String(value) : value);
    last = at + match[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

export { ar, en };
export { getLocale, isEnglish, localeDir, pick, setLocale, type Locale } from './locale';
