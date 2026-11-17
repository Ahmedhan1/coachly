/** Minimal GLB container reader: enough to look at the JSON chunk before handing the file to three.js. */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

export interface GltfJsonSummary {
  extensionsUsed: string[];
  extensionsRequired: string[];
}

export function readGlbJson(buffer: ArrayBuffer): GltfJsonSummary {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + length > buffer.byteLength) throw new Error('GLB: missing JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as {
    extensionsUsed?: unknown;
    extensionsRequired?: unknown;
  };
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { extensionsUsed: list(json.extensionsUsed), extensionsRequired: list(json.extensionsRequired) };
}

export const DRACO_EXTENSION = 'KHR_draco_mesh_compression';

/** The Draco decoder (public/draco/) is loaded only for models that use mesh compression. */
export function glbNeedsDraco(buffer: ArrayBuffer): boolean {
  const { extensionsUsed, extensionsRequired } = readGlbJson(buffer);
  return extensionsUsed.includes(DRACO_EXTENSION) || extensionsRequired.includes(DRACO_EXTENSION);
}
