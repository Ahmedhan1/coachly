import { Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { nearestMuscleHit, pickMuscleAt, tapSamples } from './pick';

const hit = (name: string, distance: number) => ({ distance, object: { name, parent: null } });

describe('nearestMuscleHit', () => {
  it('picks the closest muscle over all samples (a tap through a gap does not reach a deep muscle)', () => {
    const samples = [[hit('lats', 4.29)], [hit('chest', 4.1), hit('lats', 4.29)], []];
    expect(nearestMuscleHit(samples)).toBe('chest');
  });

  it('ignores the neutral base and unknown meshes', () => {
    expect(nearestMuscleHit([[hit('body_base', 3), hit('Cube', 3.5), hit('quads_L', 4)]])).toBe('quads');
  });

  it('returns null when nothing selectable was hit', () => {
    expect(nearestMuscleHit([[], [hit('body_base', 2)]])).toBeNull();
  });
});

describe('tapSamples', () => {
  it('is the tap point plus a ring of points at the given pixel radius, in NDC', () => {
    const pts = tapSamples({ x: 50, y: 100 }, { width: 100, height: 200 }, 10, 4);
    expect(pts).toHaveLength(5);
    expect(pts[0]?.x).toBeCloseTo(0);
    expect(pts[0]?.y).toBeCloseTo(0);
    expect(pts[1]?.x).toBeCloseTo(0.2);
    expect(pts[1]?.y).toBeCloseTo(0);
  });
});

describe('pickMuscleAt', () => {
  it('raycasts a real scene and returns the front muscle', () => {
    const root = new Group();
    const front = new Mesh(new BoxGeometry(1, 1, 0.1), new MeshBasicMaterial());
    front.name = 'chest';
    front.position.z = 1;
    const back = new Mesh(new BoxGeometry(3, 3, 0.1), new MeshBasicMaterial());
    back.name = 'lats';
    root.add(front, back);
    root.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(40, 1);
    camera.position.set(0, 0, 6);
    camera.lookAt(new Vector3());
    camera.updateMatrixWorld(true);
    // Centre → chest; a point well outside the small front box → lats.
    expect(pickMuscleAt(root, camera, { x: 50, y: 50 }, { width: 100, height: 100 })).toBe('chest');
    expect(pickMuscleAt(root, camera, { x: 50, y: 30 }, { width: 100, height: 100 }, 2)).toBe('lats');
  });
});
