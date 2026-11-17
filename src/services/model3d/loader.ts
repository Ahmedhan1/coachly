import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbNeedsDraco } from './glb';
import { revealCoveredGroups } from './reveal';

/** Served from public/models/ (Z-Anatomy export, docs/3D_MODEL.md); precached by the service worker. */
export const MODEL_URL = '/models/muscles.glb';
/** Local copy of three's glTF Draco decoder (no CDN): public/draco/. */
export const DRACO_DECODER_PATH = '/draco/';

let cached: { url: string; buffer: Promise<ArrayBuffer> } | null = null;

/** Downloads the GLB once per run; a failure is not cached. */
export function fetchModelBuffer(url = MODEL_URL, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<ArrayBuffer> {
  if (cached?.url === url) return cached.buffer;
  const buffer = fetchFn(url).then(async (res) => {
    if (!res.ok) throw new Error(`model HTTP ${res.status}`);
    return res.arrayBuffer();
  });
  cached = { url, buffer };
  buffer.catch(() => {
    if (cached?.buffer === buffer) cached = null;
  });
  return buffer;
}

/** Parses a GLB into a fresh scene graph. The Draco decoder is set up only when the file needs it. */
export async function parseModel(buffer: ArrayBuffer): Promise<Object3D> {
  const loader = new GLTFLoader();
  let dispose = () => {};
  if (glbNeedsDraco(buffer)) {
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    draco.setDecoderConfig({ type: 'wasm' });
    loader.setDRACOLoader(draco);
    dispose = () => draco.dispose();
  }
  try {
    // parse() may detach nothing, but give it its own copy so the cached buffer stays reusable.
    const gltf = await loader.parseAsync(buffer.slice(0), '');
    revealCoveredGroups(gltf.scene);
    return gltf.scene;
  } finally {
    dispose();
  }
}

/** A new, independent copy of the muscle model (each viewer disposes its own). */
export async function loadMuscleModel(url = MODEL_URL): Promise<Object3D> {
  return parseModel(await fetchModelBuffer(url));
}
