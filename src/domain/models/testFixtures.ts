import type { EntityMeta } from './common';

/** Shared test helper: valid entity metadata. */
export const meta = (overrides: Partial<EntityMeta> = {}): EntityMeta => ({
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
  demo: false,
  ...overrides,
});
