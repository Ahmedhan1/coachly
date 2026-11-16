export type ModelState = 'loading' | 'ready' | 'error';
export type ViewerMode = { kind: '3d'; loading: boolean } | { kind: '2d'; reason: 'no-webgl' | 'load-error' };

/** 3D when WebGL works and the model loaded (or is still loading); otherwise the 2D map with a reason. */
export function viewerMode(webgl: boolean, model: ModelState): ViewerMode {
  if (!webgl) return { kind: '2d', reason: 'no-webgl' };
  if (model === 'error') return { kind: '2d', reason: 'load-error' };
  return { kind: '3d', loading: model === 'loading' };
}

type CanvasFactory = () => { getContext(id: string): unknown } | null;

/** True when a WebGL (1 or 2) context can be created. Never throws. */
export function detectWebGL(
  createCanvas: CanvasFactory = () => (typeof document === 'undefined' ? null : document.createElement('canvas')),
): boolean {
  try {
    const canvas = createCanvas();
    if (!canvas) return false;
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
