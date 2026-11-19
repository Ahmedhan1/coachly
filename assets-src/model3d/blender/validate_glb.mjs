#!/usr/bin/env node
// Checks a muscles GLB (placeholder or real export) without dependencies:
//   node assets-src/model3d/blender/validate_glb.mjs path/to/muscles.glb
// Verifies the GLB header and chunks, that every group id exists as a node AND a mesh name, that
// accessors/bufferViews stay inside the binary chunk, and prints triangles per group and the file size.
// Exit code 1 on any problem.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IDS = [
  'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'abductors', 'chest', 'lats', 'traps',
  'middle_back', 'lower_back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'neck',
  'body_base',
];
const MAX_BYTES = 10 * 1024 * 1024;

export function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const errors = [];
  if (buf.length < 20) return { errors: ['file too small'] };
  if (dv.getUint32(0, true) !== 0x46546c67) errors.push('bad magic (not glTF binary)');
  if (dv.getUint32(4, true) !== 2) errors.push(`version ${dv.getUint32(4, true)} != 2`);
  if (dv.getUint32(8, true) !== buf.length) errors.push(`header length ${dv.getUint32(8, true)} != file size ${buf.length}`);
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) errors.push('first chunk is not JSON');
  if (jsonLen % 4) errors.push('JSON chunk not 4-byte aligned');
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  let binLen = 0;
  const o = 20 + jsonLen;
  if (o < buf.length) {
    binLen = dv.getUint32(o, true);
    if (dv.getUint32(o + 4, true) !== 0x004e4942) errors.push('second chunk is not BIN');
    if (o + 8 + binLen > buf.length) errors.push('BIN chunk runs past end of file');
  }
  return { json, binLen, errors };
}

export function validate(buf) {
  const { json, binLen, errors } = parseGlb(buf);
  if (!json) return { errors, triangles: {} };
  const nodeNames = new Set((json.nodes ?? []).map((n) => n.name));
  const meshNames = new Set((json.meshes ?? []).map((m) => m.name));
  for (const id of IDS) {
    if (!nodeNames.has(id)) errors.push(`missing node "${id}"`);
    if (!meshNames.has(id)) errors.push(`missing mesh "${id}"`);
  }
  for (const [i, bv] of (json.bufferViews ?? []).entries()) {
    if ((bv.byteOffset ?? 0) + bv.byteLength > binLen) errors.push(`bufferView ${i} outside BIN chunk`);
  }
  const triangles = {};
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    let t = 0;
    for (const p of json.meshes[node.mesh].primitives) {
      const a = p.indices !== undefined ? json.accessors[p.indices] : json.accessors[p.attributes.POSITION];
      t += Math.floor(a.count / 3);
    }
    triangles[node.name] = t;
  }
  return { errors, triangles, json };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node assets-src/model3d/blender/validate_glb.mjs file.glb');
    process.exit(2);
  }
  const buf = readFileSync(path);
  const { errors, triangles, json } = validate(buf);
  console.log(`file: ${path}`);
  console.log(`size: ${buf.length} bytes (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  if (json) {
    console.log(`generator: ${json.asset?.generator ?? '?'}${json.asset?.extras?.placeholder ? '  [PLACEHOLDER]' : ''}`);
    console.log(`extensionsUsed: ${(json.extensionsUsed ?? []).join(', ') || 'none'}`);
    console.log(`nodes: ${(json.nodes ?? []).map((n) => n.name).join(', ')}`);
    for (const [k, v] of Object.entries(triangles)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(7)} triangles`);
    console.log(`  ${'TOTAL'.padEnd(12)} ${String(Object.values(triangles).reduce((a, b) => a + b, 0)).padStart(7)} triangles`);
  }
  if (buf.length > MAX_BYTES) errors.push('file is bigger than 10 MB');
  if (errors.length) {
    console.error('FAIL:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('OK: all 19 ids present, GLB structure valid');
}
