import { readFileSync } from 'node:fs';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUP_IDS } from '@/domain/exercises';
import { detectWebGL, viewerMode } from './fallback';
import { DRACO_EXTENSION, glbNeedsDraco, readGlbJson } from './glb';
import { fetchModelBuffer, parseModel } from './loader';
import { meshRole, missingGroups, roleOfObject } from './meshNames';
import { paletteFill } from '@/domain/exercises/musclePalette';
import { frameModel } from './stage';
import { meshColor, tintModel } from './tint';

const PLACEHOLDER = 'public/models/muscles.glb';
const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const palette = { base: '#dddddd', off: '#bbbbbb', hit: '#f25c1f' };

function glbWithJson(json: object): ArrayBuffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(20 + body.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buf.byteLength, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(body);
  return buf;
}

describe('mesh name mapping', () => {
  it('maps group ids, exporter suffixes and the neutral base', () => {
    expect(meshRole('glutes')).toEqual({ kind: 'muscle', group: 'glutes' });
    expect(meshRole('Middle_Back.001')).toEqual({ kind: 'muscle', group: 'middle_back' });
    expect(meshRole('quads_L')).toEqual({ kind: 'muscle', group: 'quads' });
    expect(meshRole('lats_primitive0')).toEqual({ kind: 'muscle', group: 'lats' });
    expect(meshRole('body_base')).toEqual({ kind: 'base' });
    expect(meshRole('Cube')).toEqual({ kind: 'unknown' });
  });

  it('walks up to a named parent node', () => {
    const parent = { name: 'chest', parent: null };
    expect(roleOfObject({ name: '', parent })).toEqual({ kind: 'muscle', group: 'chest' });
    expect(roleOfObject(null)).toEqual({ kind: 'unknown' });
  });

  it('the placeholder GLB has every group except hip_flexors and tibialis', async () => {
    const scene = await parseModel(toArrayBuffer(readFileSync(PLACEHOLDER)));
    const names: string[] = [];
    scene.traverse((o) => names.push(o.name));
    expect(missingGroups(names, MUSCLE_GROUP_IDS)).toEqual(['hip_flexors', 'tibialis']);
    expect(names).toContain('body_base');
    const { distance } = frameModel(scene, 0.5);
    expect(distance).toBeGreaterThan(1);
  });
});

describe('Draco detection', () => {
  it('reads the GLB JSON chunk', () => {
    expect(glbNeedsDraco(toArrayBuffer(readFileSync(PLACEHOLDER)))).toBe(false);
    expect(glbNeedsDraco(glbWithJson({ asset: { version: '2.0' }, extensionsUsed: [DRACO_EXTENSION] }))).toBe(true);
    expect(readGlbJson(glbWithJson({ extensionsRequired: [DRACO_EXTENSION] })).extensionsRequired).toEqual([DRACO_EXTENSION]);
    expect(() => readGlbJson(new ArrayBuffer(8))).toThrow('not a GLB');
  });
});

describe('fallback logic', () => {
  it('chooses 3D only with WebGL and a loadable model', () => {
    expect(viewerMode(false, 'ready')).toEqual({ kind: '2d', reason: 'no-webgl' });
    expect(viewerMode(true, 'error')).toEqual({ kind: '2d', reason: 'load-error' });
    expect(viewerMode(true, 'loading')).toEqual({ kind: '3d', loading: true });
    expect(viewerMode(true, 'ready')).toEqual({ kind: '3d', loading: false });
  });

  it('detects WebGL without throwing', () => {
    expect(detectWebGL(() => null)).toBe(false);
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false);
    expect(detectWebGL(() => ({ getContext: (id: string) => (id === 'webgl' ? {} : null) }))).toBe(true);
    expect(
      detectWebGL(() => {
        throw new Error('boom');
      }),
    ).toBe(false);
  });

  it('does not cache a failed model download', async () => {
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response('', { status: 503 }) : new Response(new ArrayBuffer(4)))) as typeof fetch;
    await expect(fetchModelBuffer('/m.glb', flaky)).rejects.toThrow('503');
    expect((await fetchModelBuffer('/m.glb', flaky)).byteLength).toBe(4);
    expect((await fetchModelBuffer('/m.glb', flaky)).byteLength).toBe(4);
    expect(n).toBe(2);
  });
});

describe('tinting', () => {
  it('colours each mesh by intensity, keeps the base neutral and hides unknown meshes', () => {
    const root = new Group();
    const mesh = (name: string) => {
      const m = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
      m.name = name;
      root.add(m);
      return m;
    };
    const glutes = mesh('glutes');
    const hams = mesh('hamstrings');
    const base = mesh('body_base');
    const junk = mesh('Camera_helper');
    const dispose = tintModel(root, { glutes: 1, hamstrings: 0.5 }, palette);
    const hex = (m: Mesh) => `#${(m.material as MeshStandardMaterial).color.getHexString()}`;
    expect(hex(glutes)).toBe('#f25c1f');
    expect(hex(hams)).toBe(paletteFill(0.5, palette));
    expect(hex(base)).toBe('#dddddd');
    expect(junk.visible).toBe(false);
    expect(meshColor('lats', {}, palette)).toBe('#bbbbbb');
    dispose();
  });
});

describe('region framing', () => {
  it('fills the frame with the region but keeps a minimum window of the body', async () => {
    const { regionView, distanceForHeight } = await import('./framing');
    // a small muscle (10% of a 1.8 m body) still shows 42% of the body
    const small = regionView({ center: { x: 0, y: 0.9 }, size: { w: 0.3, h: 0.18 } }, 1.8, 0.67, 0.65, 0.42);
    expect(small.visibleHeight).toBeCloseTo(1.8 * 0.42, 5);
    // a big region is zoomed to fill 65%
    const big = regionView({ center: { x: 0, y: 1.2 }, size: { w: 0.4, h: 0.9 } }, 1.8, 0.67, 0.65, 0.42);
    expect(big.visibleHeight).toBeCloseTo(0.9 / 0.65, 5);
    // never zoomed out past the whole body
    expect(regionView({ center: { x: 0, y: 1 }, size: { w: 1, h: 5 } }, 1.8, 0.67, 0.65, 0.42).visibleHeight).toBeLessThanOrEqual(1.8 * 1.12 + 1e-9);
    expect(distanceForHeight(1, 28, 0)).toBeGreaterThan(distanceForHeight(0.5, 28, 0));
  });
});
