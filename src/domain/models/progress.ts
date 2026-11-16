import { z } from 'zod';
import { entityMetaShape, isoDateSchema, longTextSchema } from './common';
import { measurementsSchema } from './client';
import { clientIdSchema, imageIdSchema, progressEntryIdSchema } from './ids';

export const progressEntrySchema = z.object({
  id: progressEntryIdSchema,
  clientId: clientIdSchema,
  date: isoDateSchema,
  measurements: measurementsSchema,
  photoIds: z.array(imageIdSchema).max(12),
  notes: longTextSchema,
  /** Entries can come from the trainer or from the client's weekly check-in link. */
  source: z.enum(['trainer', 'client']),
  ...entityMetaShape,
});

export type ProgressEntry = z.infer<typeof progressEntrySchema>;
