import { isMuscleGroupId, type MuscleGroupId } from '@/domain/exercises';

/** Neutral body mesh: never tinted, never selectable. */
export const BASE_MESH_NAME = 'body_base';

export type MeshRole = { kind: 'muscle'; group: MuscleGroupId } | { kind: 'base' } | { kind: 'unknown' };

/**
 * Mesh/node name in muscles.glb → role. Names equal the muscle group ids (docs/3D_MODEL.md); exporters may
 * append ".001", "_1", "-L" or "_primitive0", so those suffixes are ignored. Case-insensitive.
 */
export function meshRole(name: string): MeshRole {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/(_primitive\d+|[._-](\d+|l|r|left|right))+$/u, '');
  if (clean === BASE_MESH_NAME) return { kind: 'base' };
  if (isMuscleGroupId(clean)) return { kind: 'muscle', group: clean };
  return { kind: 'unknown' };
}

/** Walks up a hit object's ancestors (a mesh may sit under its named node) to the first named role. */
export function roleOfObject(object: { name: string; parent: unknown } | null): MeshRole {
  let current = object as { name: string; parent: unknown } | null;
  while (current) {
    const role = meshRole(current.name);
    if (role.kind !== 'unknown') return role;
    current = (current.parent as { name: string; parent: unknown } | null) ?? null;
  }
  return { kind: 'unknown' };
}

/** Which of the expected groups the model lacks (e.g. the placeholder has no hip_flexors/tibialis). */
export function missingGroups(names: readonly string[], expected: readonly MuscleGroupId[]): MuscleGroupId[] {
  const present = new Set(
    names.map(meshRole).flatMap((r) => (r.kind === 'muscle' ? [r.group] : [])),
  );
  return expected.filter((id) => !present.has(id));
}
