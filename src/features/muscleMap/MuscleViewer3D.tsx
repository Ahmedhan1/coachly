import { Canvas, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Group, type Object3D, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MuscleGroupId } from '@/domain/exercises';
import { t } from '@/i18n';
import { MuscleMap } from '@/ui/MuscleMap';
import {
  CAMERA_FOV,
  createLights,
  detectWebGL,
  disposeModel,
  frameModel,
  loadMuscleModel,
  pickMuscleAt,
  placeCamera,
  themePalette,
  tintModel,
  viewerMode,
  type ModelState,
  type ModelView,
  type MuscleIntensities,
} from '@/services/model3d';
import styles from './MuscleMap.module.css';

export interface MuscleViewer3DProps {
  intensities: MuscleIntensities;
  selected: MuscleGroupId | null;
  onSelect: (id: MuscleGroupId) => void;
  /** Bumped by the parent to put the camera back to the front view. */
  resetKey?: number;
}

const VIEWS: readonly ModelView[] = ['front', 'side', 'back'];

/** The stage is dark in both themes, so the body keeps the light-theme greys; only the brand follows the theme. */
const STAGE_BODY = { base: '#d9dad6', off: '#c3c5c1' } as const;

/** Pointer travel (px) above which a tap is treated as a drag (rotation), not a selection. */
const TAP_SLOP = 8;

/**
 * r3f viewer: drag to rotate, pinch/wheel to zoom, tap a muscle to select it. Renders on demand only
 * (frameloop="demand" + invalidate on changes), DPR capped at 2, everything disposed on unmount.
 * No WebGL or a failed model → the 2D map with a short message.
 */
export default function MuscleViewer3D(props: MuscleViewer3DProps) {
  const [webgl] = useState(() => detectWebGL());
  const [model, setModel] = useState<Object3D | null>(null);
  const [state, setState] = useState<ModelState>('loading');
  const [view, setView] = useState<ModelView>('front');
  const [viewKey, setViewKey] = useState(0);

  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    let loaded: Object3D | null = null;
    loadMuscleModel().then(
      (m) => {
        if (!alive) return disposeModel(m);
        loaded = m;
        setModel(m);
        setState('ready');
      },
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
      if (loaded) disposeModel(loaded);
    };
  }, [webgl]);

  const mode = viewerMode(webgl, state);
  if (mode.kind === '2d') {
    return (
      <div className={styles.fallback} data-testid="viewer-fallback">
        <p className={styles.notice} role="status">
          {t(mode.reason === 'no-webgl' ? 'training.muscles3d.fallbackNoWebgl' : 'training.muscles3d.fallbackLoadError')}
        </p>
        <MuscleMap view="both" size={300} intensities={props.intensities} selected={props.selected} onSelect={props.onSelect} captions />
      </div>
    );
  }
  return (
    <div className={styles.stage} data-testid="viewer-3d" data-state={state}>
      {mode.loading || !model ? (
        <p className={styles.loading}>{t('training.muscles3d.loading')}</p>
      ) : (
        <CanvasBoundary onError={() => setState('error')}>
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ fov: CAMERA_FOV, position: [0, 1, 5] }}
            gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
            aria-label={t('training.muscles3d.canvasLabel')}
            role="img"
            className={styles.canvas}
          >
            <Scene
              model={model}
              {...props}
              view={view}
              resetKey={(props.resetKey ?? 0) * 1000 + viewKey}
              onContextLost={() => setState('error')}
            />
          </Canvas>
        </CanvasBoundary>
      )}
      {model && (
        <div className={styles.views} role="group" aria-label={t('training.muscles3d.viewsLabel')}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={styles.viewBtn}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setViewKey((k) => k + 1);
              }}
            >
              {t(`training.muscles3d.views.${v}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SceneProps extends MuscleViewer3DProps {
  model: Object3D;
  view?: ModelView;
  onContextLost: () => void;
}

function Scene({ model, intensities, selected, onSelect, resetKey = 0, view = 'front', onContextLost }: SceneProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const lights = useMemo(() => {
    const g = new Group();
    g.add(...createLights());
    return g;
  }, []);
  const palette = useMemo(() => ({ ...themePalette(), ...STAGE_BODY }), []);
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enablePan = false;
    c.enableDamping = false;
    c.rotateSpeed = 0.8;
    c.addEventListener('change', () => invalidate());
    controls.current = c;
    return () => {
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const { target, distance } = frameModel(model, aspect);
    placeCamera(camera, target, distance, view);
    const c = controls.current;
    if (c) {
      c.target.copy(target);
      c.minDistance = distance * 0.35;
      c.maxDistance = distance * 1.6;
      c.update();
    }
    invalidate();
  }, [model, camera, size.width, size.height, resetKey, view, invalidate]);

  useEffect(() => {
    const dispose = tintModel(model, intensities, palette, selected);
    invalidate();
    return dispose;
  }, [model, intensities, palette, selected, invalidate]);

  // Tap (not drag) → the nearest muscle under a finger-sized ring of rays. Listening on the canvas keeps
  // OrbitControls in charge of drags and pinches.
  const handlers = useRef({ onSelect, onContextLost });
  useEffect(() => {
    handlers.current = { onSelect, onContextLost };
  }, [onSelect, onContextLost]);
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    let pointers = 0;
    const onDown = (e: PointerEvent) => {
      pointers += 1;
      down = pointers === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      const start = down;
      down = null;
      if (!start || start.id !== e.pointerId || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
      const rect = el.getBoundingClientRect();
      const group = pickMuscleAt(model, camera, { x: e.clientX - rect.left, y: e.clientY - rect.top }, rect);
      if (group) handlers.current.onSelect(group);
    };
    const onCancel = () => {
      pointers = 0;
      down = null;
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      handlers.current.onContextLost();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('webglcontextlost', onLost);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('webglcontextlost', onLost);
    };
  }, [gl, camera, model]);

  return (
    <>
      <primitive object={lights} />
      <primitive object={model} />
    </>
  );
}

/** Context creation can throw inside the canvas; fall back to 2D instead of breaking the screen. */
class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
