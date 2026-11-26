import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { loadMuscleModel } from './loader';
import type { MuscleIntensities, MuscleMapPalette } from '@/domain/exercises/musclePalette';
import { CAMERA_FOV, createLights, frameModel, placeCamera, type ModelView } from './stage';
import { disposeModel, themePalette, tintModel } from './tint';

export interface SnapshotOptions {
  /** Output size in px (default 512 × 1024). */
  width?: number;
  height?: number;
  /** Colours; default: the current theme's --muscle-base / --muscle-off / --brand. */
  palette?: MuscleMapPalette;
  modelUrl?: string;
}

/**
 * Renders the muscle model offscreen with each group tinted by intensity, transparent background, and
 * returns a PNG. For the PDF builder. Rejects when WebGL or the model is unavailable — callers fall back to
 * the 2D MuscleMap (pure SVG).
 */
export async function snapshot(
  groupIntensities: MuscleIntensities,
  view: ModelView = 'front',
  options: SnapshotOptions = {},
): Promise<Blob> {
  const width = options.width ?? 512;
  const height = options.height ?? 1024;
  const model = await loadMuscleModel(options.modelUrl);
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    scene.add(...createLights(), model);
    tintModel(model, groupIntensities, options.palette ?? themePalette());
    const camera = new PerspectiveCamera(CAMERA_FOV, width / height);
    const { target, distance } = frameModel(model, width / height);
    placeCamera(camera, target, distance, view);
    renderer.render(scene, camera);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('snapshot encode failed'))), 'image/png'),
    );
  } finally {
    disposeModel(model);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
