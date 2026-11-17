import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { pickMuscleAt } from './pick';
import { revealCoveredGroups } from './reveal';

/** A 0.3 × 0.3 m plane facing +Z at depth z, centred at x. */
function plane(name: string, x: number, z: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(0.3, 0.3, 6, 6), new MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(x, 0, z);
  return mesh;
}

function triangles(mesh: Mesh): number {
  const g = mesh.geometry as BufferGeometry;
  return (g.getIndex()?.count ?? g.getAttribute('position').count) / 3;
}

describe('revealCoveredGroups', () => {
  it('cuts the obliques sheet where it lies over the abs, keeps the rest and other groups', () => {
    const root = new Group();
    const abs = plane('abs', 0, 0);
    const sheath = plane('obliques', 0.15, 0.003); // half over the abs, 3 mm in front
    const behind = plane('obliques_L', 0, -0.05); // behind the abs: not covering
    const chest = plane('chest', 0, 0.01);
    root.add(abs, sheath, behind, chest);
    const before = triangles(sheath);
    const removed = revealCoveredGroups(root);
    expect(removed).toBeGreaterThan(0);
    expect(triangles(sheath)).toBeLessThan(before);
    expect(triangles(sheath)).toBeGreaterThan(before / 4); // the lateral half stays
    expect(triangles(behind)).toBe(72);
    expect(triangles(chest)).toBe(72);
    expect(triangles(abs)).toBe(72);
  });

  it('makes the abs tappable after the cut', () => {
    const root = new Group();
    root.add(plane('abs', 0, 0), plane('obliques', 0, 0.003));
    root.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(30, 1);
    camera.position.set(0, 0, 2);
    camera.lookAt(new Vector3());
    camera.updateMatrixWorld(true);
    const size = { width: 100, height: 100 };
    expect(pickMuscleAt(root, camera, { x: 50, y: 50 }, size)).toBe('obliques');
    revealCoveredGroups(root);
    expect(pickMuscleAt(root, camera, { x: 50, y: 50 }, size)).toBe('abs');
  });

  it('opens a back layer over a deeper back group (seen from -Z)', () => {
    const root = new Group();
    const rhomboids = plane('middle_back', 0, -0.1);
    const traps = plane('traps', 0, -0.103); // 3 mm further back = over the rhomboids from behind
    const trapsFront = plane('traps_R', 0, 0.2); // not behind anything
    root.add(rhomboids, traps, trapsFront);
    revealCoveredGroups(root);
    expect(triangles(traps)).toBe(0);
    expect(triangles(trapsFront)).toBe(72);
    expect(triangles(rhomboids)).toBe(72);
  });

  it('works on non-indexed geometry and does nothing without the covered group', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const root = new Group();
    const m = new Mesh(g, new MeshBasicMaterial());
    m.name = 'obliques';
    root.add(m);
    expect(revealCoveredGroups(root)).toBe(0);
    expect(triangles(m)).toBe(1);
  });
});
