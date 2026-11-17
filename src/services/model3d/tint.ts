import { Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import type { MuscleGroupId } from '@/domain/exercises';
import { paletteFill, type MuscleIntensities, type MuscleMapPalette } from './palette';
import { roleOfObject } from './meshNames';

/** Reads the theme's muscle colours as hex (CSS variables resolved); the defaults match tokens.css light. */
export function themePalette(root: Element | null = typeof document === 'undefined' ? null : document.documentElement): MuscleMapPalette {
  const fallback: MuscleMapPalette = { base: '#d9dad6', off: '#c3c5c1', hit: '#f25c1f' };
  if (!root || typeof getComputedStyle === 'undefined') return fallback;
  const style = getComputedStyle(root);
  const read = (name: string, def: string) => {
    const v = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : def;
  };
  return { base: read('--muscle-base', fallback.base), off: read('--muscle-off', fallback.off), hit: read('--brand', fallback.hit) };
}

/** Colour of one mesh: the same light → strong brand scale as the 2D map. */
export function meshColor(group: MuscleGroupId | 'base', intensities: MuscleIntensities, palette: MuscleMapPalette): string {
  return group === 'base' ? palette.base : paletteFill(intensities[group], palette);
}

/**
 * Gives every mesh its own material coloured by intensity (selected group lifted a little).
 * Returns a dispose function for the materials it created.
 */
export function tintModel(
  root: Object3D,
  intensities: MuscleIntensities,
  palette: MuscleMapPalette,
  selected: MuscleGroupId | null = null,
): () => void {
  const created: Material[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const role = roleOfObject(obj);
    if (role.kind === 'unknown') {
      obj.visible = false;
      return;
    }
    const group = role.kind === 'base' ? 'base' : role.group;
    const material = new MeshStandardMaterial({
      color: new Color(meshColor(group, intensities, palette)),
      roughness: role.kind === 'base' ? 0.9 : 0.62,
      metalness: 0,
      transparent: role.kind === 'base',
      opacity: role.kind === 'base' ? 0.55 : 1,
      depthWrite: role.kind !== 'base',
    });
    if (role.kind === 'muscle' && role.group === selected) material.emissive = new Color(palette.hit).multiplyScalar(0.35);
    created.push(material);
    obj.material = material;
  });
  return () => created.forEach((m) => m.dispose());
}

/** Frees the geometries of a loaded model (call on unmount). */
export function disposeModel(root: Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
