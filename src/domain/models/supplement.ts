import { z } from 'zod';
import { currencySchema, entityMetaShape, longTextSchema, moneyMinorSchema, requiredNameSchema, shortTextSchema } from './common';
import { imageIdSchema, supplementIdSchema } from './ids';

/**
 * A product in the trainer's catalog. `dose` and `timing` are free text the trainer types;
 * the app never fills them in or suggests values.
 */
export const supplementSchema = z.object({
  id: supplementIdSchema,
  name: requiredNameSchema,
  imageId: imageIdSchema.nullable(),
  priceMinor: moneyMinorSchema.nullable(),
  currency: currencySchema,
  dose: shortTextSchema,
  timing: shortTextSchema,
  notes: longTextSchema,
  ...entityMetaShape,
});

export type Supplement = z.infer<typeof supplementSchema>;
