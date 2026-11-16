/**
 * 3D muscle model service: loading (GLB, Draco only when needed), per-group tinting, fallback decision and
 * an offscreen PNG snapshot for the PDF builder.
 */
export { snapshot, type SnapshotOptions } from './snapshot';
export { loadMuscleModel, fetchModelBuffer, parseModel, MODEL_URL, DRACO_DECODER_PATH } from './loader';
export { meshRole, roleOfObject, missingGroups, BASE_MESH_NAME, type MeshRole } from './meshNames';
export { glbNeedsDraco, readGlbJson, DRACO_EXTENSION } from './glb';
export { viewerMode, detectWebGL, type ModelState, type ViewerMode } from './fallback';
export { tintModel, disposeModel, themePalette, meshColor } from './tint';
export { createLights, frameModel, placeCamera, CAMERA_FOV, type ModelView } from './stage';
export * from './palette';
