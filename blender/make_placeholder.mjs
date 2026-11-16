#!/usr/bin/env node
// Generates a tiny STAND-IN muscles GLB (not anatomy!) so the app's 3D viewer can be built and tested before
// the real Z-Anatomy export exists. No dependencies: the GLB binary is written by hand.
//
//   node blender/make_placeholder.mjs [out.glb]
//   default out: model-repo-template/placeholder/muscles.placeholder.glb
//
// Same contract as blender/export_muscles.py: glTF Y-up, metres, 1.8 m tall, feet centre at the origin,
// the figure faces +Z, the figure's LEFT side is +X. One node + one mesh per id (names identical), one
// shared material "muscle". Front markers: a nose box on the head and feet pointing to +Z.
// This file is our own work (no Z-Anatomy data) - it can be used freely.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? resolve(HERE, '../model-repo-template/placeholder/muscles.placeholder.glb'));

export const GROUP_IDS = [
  'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'abductors', 'chest', 'lats', 'traps',
  'middle_back', 'lower_back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'neck',
];
export const ALL_IDS = [...GROUP_IDS, 'body_base'];

// ------------------------------------------------------------------------------------------ geometry ---
function ellipsoid([cx, cy, cz], [rx, ry, rz], seg = 10, rings = 7) {
  const pos = [], nor = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const v = (r / rings) * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const u = (s / seg) * Math.PI * 2;
      const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
      pos.push(cx + rx * nx, cy + ry * ny, cz + rz * nz);
      const n = [nx / rx, ny / ry, nz / rz]; // ellipsoid normal
      const l = Math.hypot(...n) || 1;
      nor.push(n[0] / l, n[1] / l, n[2] / l);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      if (r !== 0) idx.push(a, a + 1, b);            // counter-clockwise seen from outside
      if (r !== rings - 1) idx.push(a + 1, b + 1, b);
    }
  }
  return { pos, nor, idx };
}

function box([cx, cy, cz], [sx, sy, sz]) {
  const pos = [], nor = [], idx = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, w] of faces) {
    const base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((i) => n[i] + a * u[i] + b * w[i]);
      pos.push(cx + (p[0] * sx) / 2, cy + (p[1] * sy) / 2, cz + (p[2] * sz) / 2);
      nor.push(...n);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos, nor, idx };
}

function merge(parts) {
  const out = { pos: [], nor: [], idx: [] };
  for (const p of parts) {
    const off = out.pos.length / 3;
    out.pos.push(...p.pos);
    out.nor.push(...p.nor);
    out.idx.push(...p.idx.map((i) => i + off));
  }
  return out;
}

/** Left (+X) and right (-X) copies. */
const pair = (fn, [x, y, z], ...rest) => [fn([x, y, z], ...rest), fn([-x, y, z], ...rest)];
const E = ellipsoid;

const SHAPES = {
  neck: [E([0, 1.5, -0.005], [0.06, 0.07, 0.055])],
  traps: pair(E, [0.08, 1.45, -0.05], [0.1, 0.06, 0.04]),
  shoulders: pair(E, [0.21, 1.41, 0], [0.065, 0.075, 0.07]),
  chest: pair(E, [0.08, 1.32, 0.075], [0.085, 0.07, 0.035]),
  abs: pair(E, [0.035, 1.12, 0.08], [0.035, 0.14, 0.03]),
  obliques: pair(E, [0.12, 1.1, 0.04], [0.04, 0.11, 0.05]),
  lats: pair(E, [0.11, 1.22, -0.065], [0.08, 0.13, 0.035]),
  middle_back: pair(E, [0.055, 1.32, -0.085], [0.045, 0.06, 0.025]),
  lower_back: pair(E, [0.04, 1.05, -0.08], [0.035, 0.09, 0.03]),
  biceps: pair(E, [0.29, 1.24, 0.03], [0.04, 0.1, 0.035]),
  triceps: pair(E, [0.29, 1.24, -0.035], [0.042, 0.11, 0.035]),
  forearms: pair(E, [0.31, 0.98, 0], [0.04, 0.12, 0.04]),
  glutes: pair(E, [0.08, 0.92, -0.075], [0.085, 0.09, 0.06]),
  abductors: pair(E, [0.155, 0.93, -0.01], [0.04, 0.07, 0.06]),
  quads: pair(E, [0.1, 0.64, 0.035], [0.065, 0.18, 0.055]),
  hamstrings: pair(E, [0.1, 0.64, -0.045], [0.06, 0.17, 0.05]),
  adductors: pair(E, [0.045, 0.7, 0], [0.035, 0.13, 0.05]),
  calves: pair(E, [0.1, 0.33, -0.035], [0.045, 0.12, 0.045]),
  body_base: [
    E([0, 1.67, 0], [0.09, 0.11, 0.1], 12, 8), // head
    box([0, 1.66, 0.105], [0.03, 0.04, 0.04]), // nose -> front (+Z)
    E([0, 1.24, 0], [0.14, 0.27, 0.08]), // torso core
    E([0, 0.95, 0], [0.15, 0.08, 0.09]), // pelvis
    ...pair(E, [0.29, 1.25, 0], [0.035, 0.13, 0.035]), // upper-arm core
    ...pair(E, [0.32, 0.8, 0.0], [0.035, 0.06, 0.02]), // hands
    ...pair(E, [0.1, 0.42, 0], [0.045, 0.06, 0.045]), // knees
    ...pair(E, [0.1, 0.25, 0.01], [0.035, 0.17, 0.035]), // shins
    ...pair(box, [0.1, 0.03, 0.05], [0.08, 0.06, 0.24]), // feet, toes towards +Z
  ],
};

// ---------------------------------------------------------------------------------------------- GLB ---
export function buildGlb(shapes) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [], accessors = [], meshes = [], nodes = [];
  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
    chunks.push(bytes, new Uint8Array(pad));
    byteLength += bytes.length + pad;
    return bufferViews.length - 1;
  };
  for (const id of ALL_IDS) {
    const g = merge(shapes[id]);
    const pos = new Float32Array(g.pos), nor = new Float32Array(g.nor);
    const vcount = pos.length / 3;
    const idx = vcount < 65536 ? new Uint16Array(g.idx) : new Uint32Array(g.idx);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
    const aPos = accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: vcount, type: 'VEC3', min, max }) - 1;
    const aNor = accessors.push({ bufferView: addView(nor, 34962), componentType: 5126, count: vcount, type: 'VEC3' }) - 1;
    const aIdx = accessors.push({
      bufferView: addView(idx, 34963), componentType: idx instanceof Uint16Array ? 5123 : 5125, count: idx.length, type: 'SCALAR',
    }) - 1;
    meshes.push({ name: id, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aIdx, material: 0, mode: 4 }] });
    nodes.push({ name: id, mesh: meshes.length - 1 });
  }
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'make_placeholder.mjs (PT Coach)',
      extras: {
        placeholder: true,
        note: 'STAND-IN shapes, not anatomy. Replace with the Z-Anatomy export (blender/export_muscles.py).',
        contract: 'Y-up, metres, 1.8 m tall, feet centre at origin, faces +Z, figure left = +X',
      },
    },
    scene: 0,
    scenes: [{ name: 'muscles', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [{ name: 'muscle', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.36, 0.33, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonLen = jsonBytes.length + jsonPad;
  const total = 12 + 8 + jsonLen + 8 + byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen); // pad JSON with spaces
  let o = 20 + jsonLen;
  dv.setUint32(o, byteLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const glb = buildGlb(SHAPES);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, glb);
  console.log(`wrote ${OUT} (${glb.length} bytes)`);
}
