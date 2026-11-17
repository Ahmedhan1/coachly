import { z } from 'zod';
import { currencySchema, entityMetaShape, isoDateSchema, moneyMinorSchema, shortTextSchema } from './common';
import { clientIdSchema, paymentIdSchema } from './ids';

export const paymentMethodSchema = z.enum(['cash', 'instapay', 'wallet', 'bank', 'other']);
export const paymentStatusSchema = z.enum(['paid', 'due']);

export const paymentSchema = z
  .object({
    id: paymentIdSchema,
    clientId: clientIdSchema,
    amountMinor: moneyMinorSchema.refine((n) => n > 0, 'amount must be positive'),
    currency: currencySchema,
    status: paymentStatusSchema,
    /** Date it was paid; null while still due. */
    paidOn: isoDateSchema.nullable(),
    dueOn: isoDateSchema.nullable(),
    method: paymentMethodSchema,
    note: shortTextSchema,
    ...entityMetaShape,
  })
  .refine((p) => (p.status === 'paid' ? p.paidOn !== null : p.dueOn !== null), {
    message: 'paid needs paidOn, due needs dueOn',
    path: ['status'],
  });

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
