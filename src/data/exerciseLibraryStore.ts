import {
  EQUIPMENT_IDS,
  isMuscleGroupId,
  type CustomExerciseInput,
  type EquipmentId,
  type ExerciseLevel,
  type ExerciseOverride,
  type MuscleGroupId,
} from '@/domain/exercises';
import type { Exercise } from '@/domain/models';
import type { Repositories } from './repositories';

/** Minimal key/value store (the app's MetaStore over the Dexie `meta` table fits structurally). */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const HIDDEN_EXERCISES_KEY = 'exerciseLibrary.hidden';

/** Everything the trainer changed in the library, in the shape `mergeCatalog()` takes. */
export interface LibraryChanges {
  custom: CustomExerciseInput[];
  overrides: ExerciseOverride[];
  favourites: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
}

export interface NewCustomExercise {
  nameAr: string;
  primaryMuscles: readonly MuscleGroupId[];
  secondaryMuscles: readonly MuscleGroupId[];
  equipment: EquipmentId;
  level: ExerciseLevel;
  imageIds: readonly string[];
}

/** What a built-in override row needs when it is first created. */
export interface BuiltinRef {
  id: string;
  defaultNameAr: string;
  primaryMuscles: readonly MuscleGroupId[];
  secondaryMuscles: readonly MuscleGroupId[];
  equipment: EquipmentId;
  level: ExerciseLevel;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * Library customisations on top of the existing `exercises` table (no schema change):
 * - custom exercise   → row with source 'custom' (catalog id = row id);
 * - built-in override → row with source 'builtin', builtinRef = pack id; `name` is the Arabic name shown,
 *   `imageIds` the trainer's photos, `favorite` the star;
 * - hidden built-ins  → id list in the meta table (the entity schema has no hidden flag).
 */
export class ExerciseLibraryStore {
  constructor(
    private readonly repos: Pick<Repositories, 'exercises'>,
    private readonly meta: KeyValueStore,
  ) {}

  async changes(): Promise<LibraryChanges> {
    const rows = await this.repos.exercises.list();
    const hidden = new Set(asStringArray(await this.meta.get(HIDDEN_EXERCISES_KEY)));
    const custom: CustomExerciseInput[] = [];
    const overrides: ExerciseOverride[] = [];
    const favourites = new Set<string>();
    for (const row of rows) {
      const catalogId = row.source === 'custom' ? row.id : row.builtinRef;
      if (catalogId === null) continue;
      if (row.favorite) favourites.add(catalogId);
      if (row.source === 'custom') custom.push(rowToCustom(row));
      else overrides.push({ exerciseId: catalogId, nameAr: row.name, imageIds: row.imageIds, hidden: hidden.has(catalogId) });
    }
    for (const id of hidden) {
      if (!overrides.some((o) => o.exerciseId === id)) overrides.push({ exerciseId: id, hidden: true });
    }
    return { custom, overrides, favourites, hidden };
  }

  async createCustom(input: NewCustomExercise): Promise<string> {
    const row = await this.repos.exercises.create({
      source: 'custom',
      builtinRef: null,
      name: input.nameAr,
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: input.secondaryMuscles.filter((m) => !input.primaryMuscles.includes(m)),
      equipment: input.equipment,
      level: input.level,
      instructions: '',
      imageIds: [...input.imageIds],
      favorite: false,
    });
    return row.id;
  }

  /** Soft delete: `undoLastDelete()` of the data layer brings it back. */
  async deleteCustom(id: string): Promise<void> {
    await this.repos.exercises.softDelete(id);
  }

  async setFavourite(catalogId: string, builtin: BuiltinRef | null, favourite: boolean): Promise<void> {
    await this.patch(catalogId, builtin, { favorite: favourite });
  }

  /** Empty / whitespace name restores the default Arabic name. */
  async rename(catalogId: string, builtin: BuiltinRef | null, nameAr: string): Promise<void> {
    const name = nameAr.trim() === '' && builtin ? builtin.defaultNameAr : nameAr.trim();
    if (name === '') return;
    await this.patch(catalogId, builtin, { name });
  }

  /** Empty list restores the pack photos (built-in) or removes the photos (custom). */
  async setPhotos(catalogId: string, builtin: BuiltinRef | null, imageIds: readonly string[]): Promise<void> {
    await this.patch(catalogId, builtin, { imageIds: [...imageIds] });
  }

  async setHidden(catalogId: string, hidden: boolean): Promise<void> {
    const current = new Set(asStringArray(await this.meta.get(HIDDEN_EXERCISES_KEY)));
    if (hidden) current.add(catalogId);
    else current.delete(catalogId);
    await this.meta.set(HIDDEN_EXERCISES_KEY, [...current].sort());
  }

  private async findRow(catalogId: string, builtin: BuiltinRef | null): Promise<Exercise | undefined> {
    if (builtin === null) return this.repos.exercises.get(catalogId);
    const rows = await this.repos.exercises.list();
    return rows.find((r) => r.source === 'builtin' && r.builtinRef === builtin.id);
  }

  private async patch(
    catalogId: string,
    builtin: BuiltinRef | null,
    patch: Partial<Pick<Exercise, 'name' | 'favorite' | 'imageIds'>>,
  ): Promise<void> {
    const row = await this.findRow(catalogId, builtin);
    if (row) {
      await this.repos.exercises.update(row.id, patch);
      return;
    }
    if (builtin === null) throw new Error(`exercise ${catalogId} not found`);
    await this.repos.exercises.create({
      source: 'builtin',
      builtinRef: builtin.id,
      name: builtin.defaultNameAr,
      primaryMuscles: [...builtin.primaryMuscles],
      secondaryMuscles: [...builtin.secondaryMuscles],
      equipment: builtin.equipment,
      level: builtin.level,
      instructions: '',
      imageIds: [],
      favorite: false,
      ...patch,
    });
  }
}

function rowToCustom(row: Exercise): CustomExerciseInput {
  return {
    id: row.id,
    nameAr: row.name,
    primaryMuscles: row.primaryMuscles.filter(isMuscleGroupId),
    secondaryMuscles: row.secondaryMuscles.filter(isMuscleGroupId),
    equipment: (EQUIPMENT_IDS as readonly string[]).includes(row.equipment) ? (row.equipment as EquipmentId) : 'other',
    level: row.level ?? 'beginner',
    imageIds: row.imageIds,
  };
}
