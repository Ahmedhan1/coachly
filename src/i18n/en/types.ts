import type { Strings } from '../ar';

/** Same tree as the Arabic strings, but any string value (Arabic literals are `as const`). */
export type StringShape<T> = { [K in keyof T]: T[K] extends string ? string : StringShape<T[K]> };

/** The complete English shape of one top-level area of the Arabic tree. */
export type EnArea<K extends keyof Strings> = StringShape<Strings[K]>;
