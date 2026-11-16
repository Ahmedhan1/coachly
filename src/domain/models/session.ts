import { z } from 'zod';
import { entityMetaShape, isoDateSchema, longTextSchema, timestampSchema } from './common';
import { clientIdSchema, programIdSchema, sessionIdSchema } from './ids';

/** Weekly recurrence (the only kind trainers use). Weekdays: 0 = Sunday … 6 = Saturday. */
export const recurrenceRuleSchema = z
  .object({
    freq: z.literal('weekly'),
    interval: z.number().int().min(1).max(8),
    byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    until: isoDateSchema.nullable(),
    count: z.number().int().min(1).max(500).nullable(),
  })
  .refine((r) => new Set(r.byWeekday).size === r.byWeekday.length, {
    message: 'duplicate weekday',
    path: ['byWeekday'],
  })
  .refine((r) => !(r.until !== null && r.count !== null), { message: 'use until or count, not both' });

export const attendanceSchema = z.enum(['scheduled', 'attended', 'missed', 'cancelled']);

export const sessionSchema = z.object({
  id: sessionIdSchema,
  clientId: clientIdSchema,
  /** Start instant, epoch ms. */
  startsAt: timestampSchema,
  durationMin: z.number().int().min(5).max(480),
  /** Set on the first session of a series; occurrences share `seriesId`. */
  recurrence: recurrenceRuleSchema.nullable(),
  seriesId: sessionIdSchema.nullable(),
  attendance: attendanceSchema,
  programId: programIdSchema.nullable(),
  notes: longTextSchema,
  ...entityMetaShape,
});

export type Session = z.infer<typeof sessionSchema>;
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export type Attendance = z.infer<typeof attendanceSchema>;
