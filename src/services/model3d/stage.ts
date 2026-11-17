import { AmbientLight, Box3, DirectionalLight, HemisphereLight, PerspectiveCamera, Vector3, type Object3D } from 'three';

export type ModelView = 'front' | 'back' | 'side';

export const CAMERA_FOV = 28;

/** Lights shared by the viewer and the snapshot renderer. */
export function createLights(): Object3D[] {
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 3, 4);
  const rim = new DirectionalLight(0xffffff, 1.1);
  rim.position.set(-2, 2, -3);
  return [new AmbientLight(0xffffff, 0.55), new HemisphereLight(0xffffff, 0x444444, 0.6), key, rim];
}

/** Centre of the model and the camera distance that fits its height in view. */
export function frameModel(model: Object3D, aspect: number, fov = CAMERA_FOV): { target: Vector3; distance: number } {
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const target = box.getCenter(new Vector3());
  const halfV = (fov * Math.PI) / 360;
  const byHeight = size.y / 2 / Math.tan(halfV);
  const byWidth = size.x / 2 / (Math.tan(halfV) * Math.max(aspect, 0.01));
  const distance = Math.max(byHeight, byWidth) * 1.12 + size.z / 2;
  return { target, distance: Number.isFinite(distance) && distance > 0 ? distance : 4 };
}

/** The model faces +Z: the front view looks from +Z, the back view from -Z. */
export function placeCamera(camera: PerspectiveCamera, target: Vector3, distance: number, view: ModelView): void {
  if (view === 'side') camera.position.set(target.x + distance, target.y, target.z);
  else camera.position.set(target.x, target.y, target.z + (view === 'front' ? distance : -distance));
  camera.lookAt(target);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
}
