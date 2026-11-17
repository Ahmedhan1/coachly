import { BufferAttribute, Mesh, type BufferGeometry, type Object3D } from 'three';
import type { MuscleGroupId } from '@/domain/exercises';
import { roleOfObject } from './meshNames';

/**
 * Groups whose source meshes wrap over another group. Z-Anatomy's external oblique includes its
 * aponeurosis (the rectus sheath), which lies a few mm in front of the rectus abdominis: untouched, the
 * abs can never be seen, tinted or tapped.
 */
export type CoverSide = 'front' | 'back';
export const COVERING_GROUPS: readonly (readonly [covering: MuscleGroupId, covered: MuscleGroupId, side: CoverSide])[] = [
  ['obliques', 'abs', 'front'],
  // The rhomboids (middle back) lie under the middle trapezius and the erectors under the lats' fascia:
  // gym maps show them as their own areas, so the layer above is opened over them (seen from behind).
  ['traps', 'middle_back', 'back'],
  ['lats', 'middle_back', 'back'],
  ['lats', 'lower_back', 'back'],
];

/** Grid cell size for the comparison (model units = metres). */
const CELL = 0.01;
/** A covering triangle this far behind the covered surface still counts as covering (z-fighting). */
const SLACK = 0.004;

const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

function meshesOf(root: Object3D, group: MuscleGroupId): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const role = roleOfObject(obj);
    if (role.kind === 'muscle' && role.group === group) out.push(obj);
  });
  return out;
}

type Vec3 = [number, number, number];

function worldVertex(geometry: BufferGeometry, e: readonly number[], v: number): Vec3 {
  const pos = geometry.getAttribute('position');
  const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
  return [
    e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
    e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
    e[2]! * x + e[6]! * y + e[10]! * z + e[14]!,
  ];
}

function triangleIndices(geometry: BufferGeometry): (t: number) => [number, number, number] {
  const index = geometry.getIndex();
  return (t) => (index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2]);
}

const triangleCount = (geometry: BufferGeometry) => (geometry.getIndex()?.count ?? geometry.getAttribute('position').count);

/**
 * Front-most z of the covered group per (x, y) cell, in world space (the model faces +Z). Triangles are
 * rasterised onto the grid so large triangles fill every cell they cover, not only their corners.
 */
function frontDepth(meshes: readonly Mesh[], sign: 1 | -1): Map<string, number> {
  const depth = new Map<string, number>();
  const put = (x: number, y: number, rawZ: number) => {
    const z = sign * rawZ;
    const key = cellKey(x, y);
    const prev = depth.get(key);
    if (prev === undefined || z > prev) depth.set(key, z);
  };
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry;
    const e = mesh.matrixWorld.elements;
    const tri = triangleIndices(g);
    const n = triangleCount(g);
    for (let t = 0; t + 2 < n; t += 3) {
      const [a, b, c] = tri(t).map((v) => worldVertex(g, e, v)) as [Vec3, Vec3, Vec3];
      for (const p of [a, b, c]) put(p[0], p[1], p[2]);
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-12) continue; // edge-on to the camera: covers nothing from the front
      const x0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL);
      const x1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1], c[1]) / CELL);
      const y1 = Math.floor(Math.max(a[1], b[1], c[1]) / CELL);
      for (let i = x0; i <= x1; i++) {
        for (let j = y0; j <= y1; j++) {
          const px = (i + 0.5) * CELL;
          const py = (j + 0.5) * CELL;
          const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
          const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          put(px, py, l1 * a[2] + l2 * b[2] + l3 * c[2]);
        }
      }
    }
  }
  return depth;
}

/** Drops the triangles of `geometry` whose centre lies over (or flush with) the covered surface, seen from `sign`·Z. */
function trim(geometry: BufferGeometry, e: readonly number[], depth: ReadonlyMap<string, number>, sign: 1 | -1): number {
  const tri = triangleIndices(geometry);
  const n = triangleCount(geometry);
  const keep: number[] = [];
  let removed = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const ids = tri(t);
    const [a, b, c] = ids.map((v) => worldVertex(geometry, e, v)) as [Vec3, Vec3, Vec3];
    const front = depth.get(cellKey((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3));
    if (front !== undefined && (sign * (a[2] + b[2] + c[2])) / 3 >= front - SLACK) {
      removed++;
      continue;
    }
    keep.push(...ids);
  }
  if (removed > 0) {
    const big = geometry.getAttribute('position').count > 65535;
    geometry.setIndex(new BufferAttribute(big ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  }
  return removed;
}

/**
 * Removes the parts of covering groups that sit over a covered group (see COVERING_GROUPS), so every
 * group can be seen, coloured and tapped on its own. Returns the number of triangles removed.
 */
export function revealCoveredGroups(root: Object3D, pairs = COVERING_GROUPS): number {
  let removed = 0;
  for (const [covering, covered, side] of pairs) {
    const sign = side === 'front' ? 1 : -1;
    const depth = frontDepth(meshesOf(root, covered), sign);
    if (depth.size === 0) continue;
    for (const mesh of meshesOf(root, covering)) {
      mesh.updateWorldMatrix(true, false);
      removed += trim(mesh.geometry, mesh.matrixWorld.elements, depth, sign);
    }
  }
  return removed;
}
