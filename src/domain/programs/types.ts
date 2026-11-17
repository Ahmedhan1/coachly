import { localIdSchema, type ClientId, type LocalId, type ProgramDay, type ProgramItem } from '../models';

/** The editable part of a program (what the builder changes); bookkeeping fields stay in the data layer. */
export interface ProgramBody {
  name: string;
  clientId: ClientId | null;
  isTemplate: boolean;
  days: ProgramDay[];
  notes: string;
}

/** Makes a fresh nested id (program day / item). Injected so tests are deterministic. */
export type LocalIdFactory = () => LocalId;

/** Validates and brands an id string for nested program objects. */
export function toLocalId(value: string): LocalId {
  return localIdSchema.parse(value);
}

/** Item fields the trainer edits in the set editor. */
export type ProgramItemPatch = Partial<Pick<ProgramItem, 'sets' | 'reps' | 'restSec' | 'tempo' | 'rpe' | 'notes' | 'exerciseId'>>;

export const PROGRAM_LIMITS = { maxDays: 14, maxItemsPerDay: 60, maxSets: 20, maxRestSec: 900 } as const;

/** Defaults for a freshly added exercise. */
export const DEFAULT_ITEM = { sets: 3, reps: '10', restSec: 90, tempo: '', rpe: null, notes: '' } as const;
