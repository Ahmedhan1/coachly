import { z } from 'zod';
import { timestampSchema } from './common';
import { imageIdSchema } from './ids';

/** Metadata of a stored image; the Blob itself lives in the data layer's images table. */
export const imageMetaSchema = z.object({
  id: imageIdSchema,
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  bytes: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  demo: z.boolean(),
});

export type ImageMeta = z.infer<typeof imageMetaSchema>;
