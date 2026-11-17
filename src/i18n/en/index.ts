import type { Strings } from '../ar';

/** Same tree as the Arabic strings, but any string value (Arabic literals are `as const`). */
export type StringShape<T> = { [K in keyof T]: T[K] extends string ? string : StringShape<T[K]> };
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/**
 * English UI strings. Missing keys fall back to Arabic at runtime; i18n.test.ts lists any gaps.
 * Gym terms keep their normal English names (Biceps Curl, Glutes...).
 */
export const en: DeepPartial<StringShape<Strings>> = {};
