import { Raycaster, Vector2, type Camera, type Object3D } from 'three';
import type { MuscleGroupId } from '@/domain/exercises';
import { roleOfObject } from './meshNames';

interface HitLike {
  distance: number;
  object: { name: string; parent: unknown };
}

/**
 * Closest selectable muscle over several ray samples. A finger is wide: the exact tap point can slip
 * through a gap between two muscles (e.g. the sternum line) and hit a deep one behind it, so the ring of
 * samples around the tap wins with whatever is nearest to the camera.
 */
export function nearestMuscleHit(samples: readonly (readonly HitLike[])[]): MuscleGroupId | null {
  let best: { group: MuscleGroupId; distance: number } | null = null;
  for (const hits of samples) {
    for (const h of hits) {
      const role = roleOfObject(h.object as { name: string; parent: unknown });
      if (role.kind !== 'muscle') continue;
      if (!best || h.distance < best.distance) best = { group: role.group, distance: h.distance };
      break; // the first muscle of a ray is the visible one; later hits are behind it
    }
  }
  return best?.group ?? null;
}

/** The tap point and `count` points on a ring of `radius` px around it, as normalised device coords. */
export function tapSamples(
  point: { x: number; y: number },
  size: { width: number; height: number },
  radius = 10,
  count = 8,
): Vector2[] {
  const toNdc = (x: number, y: number) => new Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
  const out = [toNdc(point.x, point.y)];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push(toNdc(point.x + Math.cos(a) * radius, point.y + Math.sin(a) * radius));
  }
  return out;
}

/** Muscle group under a tap (canvas-relative px), or null. */
export function pickMuscleAt(
  root: Object3D,
  camera: Camera,
  point: { x: number; y: number },
  size: { width: number; height: number },
  radius = 10,
): MuscleGroupId | null {
  const raycaster = new Raycaster();
  const samples = tapSamples(point, size, radius).map((ndc) => {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(root, true).filter((h) => h.object.visible);
  });
  return nearestMuscleHit(samples);
}
