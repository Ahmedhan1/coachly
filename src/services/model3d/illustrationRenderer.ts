import { PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from 'three';
import type { IllustrationSpec } from '@/domain/exercises';
import { loadMuscleModel } from './loader';
import type { MuscleMapPalette } from './palette';
import { CAMERA_FOV, createLights, frameModel, placeCamera } from './stage';
import { disposeModel, tintModel } from './tint';

export const ILLUSTRATION_WIDTH = 320;
export const ILLUSTRATION_HEIGHT = 480;
/** WebGL context and model are freed this long after the last picture (iOS keeps few contexts, and memory is tight). */
const IDLE_MS = 20_000;

interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  model: Object3D;
  canvas: HTMLCanvasElement;
  untint: () => void;
}

let stage: Promise<Stage> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

async function createStage(): Promise<Stage> {
  const model = await loadMuscleModel();
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ILLUSTRATION_WIDTH, ILLUSTRATION_HEIGHT, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  scene.add(...createLights(), model);
  return { renderer, scene, model, canvas, untint: () => {} };
}

function scheduleRelease(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    const current = stage;
    stage = null;
    void current?.then((s) => {
      s.untint();
      disposeModel(s.model);
      s.renderer.dispose();
      s.renderer.forceContextLoss();
    });
  }, IDLE_MS);
}

/**
 * Renders one muscle-target picture (transparent PNG) from our own 3D model: primary muscles in the brand
 * colour, secondary ones lighter, front or back as the spec says. Reuses one WebGL context for a burst of
 * pictures. Rejects when WebGL or the model is unavailable; the caller keeps its 2D fallback.
 */
export async function renderIllustration(spec: IllustrationSpec, palette: MuscleMapPalette): Promise<Blob> {
  clearTimeout(idle);
  stage ??= createStage();
  try {
    const s = await stage;
    s.untint();
    s.untint = tintModel(s.model, spec.intensities, palette);
    const camera = new PerspectiveCamera(CAMERA_FOV, ILLUSTRATION_WIDTH / ILLUSTRATION_HEIGHT);
    const { target, distance } = frameModel(s.model, ILLUSTRATION_WIDTH / ILLUSTRATION_HEIGHT);
    placeCamera(camera, target, distance, spec.view);
    s.renderer.render(s.scene, camera);
    return await new Promise<Blob>((resolve, reject) =>
      s.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('illustration encode failed'))), 'image/png'),
    );
  } catch (error) {
    stage = null;
    throw error;
  } finally {
    scheduleRelease();
  }
}
