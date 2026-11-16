import { z } from 'zod';

/** Epoch milliseconds. Always supplied by the caller (a clock), never read here. */
export const timestampSchema = z.number().int().nonnegative();

/** Calendar date without time, `YYYY-MM-DD`, validated for real month/day values. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'invalid calendar date');
export type IsoDate = z.infer<typeof isoDateSchema>;

/** `HH:MM`, 24h. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Money is always stored in integer minor units (piasters for EGP). */
export const moneyMinorSchema = z.number().int().nonnegative();

/** ISO 4217 code. The trainer picks it; EGP is only the default. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'expected ISO 4217 code');
export const DEFAULT_CURRENCY = 'EGP';

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');

/** Free text the trainer types. Trimmed, bounded so a paste accident cannot blow up storage. */
export const shortTextSchema = z.string().trim().max(200);
export const longTextSchema = z.string().max(10_000);
export const requiredNameSchema = z.string().trim().min(1).max(120);

/**
 * Fields every stored entity carries.
 * `deletedAt` is the soft-delete marker: null while alive, a timestamp once deleted
 * (kept so "undo last delete" can restore it).
 * `demo` marks seed data so it can be removed in one action.
 */
export const entityMetaShape = {
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable(),
  demo: z.boolean(),
};

export type EntityMeta = {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  demo: boolean;
};
