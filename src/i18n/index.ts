import { ar, type Strings } from './ar';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid translation key, e.g. 'home.addClient'. */
export type TKey = Leaves<Strings>;
export type TParams = Record<string, string | number>;

function lookup(key: string): string {
  let node: unknown = ar;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
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

export { ar };
