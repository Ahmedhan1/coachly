import { toLocalId, type LocalIdFactory } from '@/domain/programs';

/** Fresh nested ids for program days and items. */
export const newLocalId: LocalIdFactory = () => toLocalId(crypto.randomUUID());
