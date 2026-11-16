import { muscleLoadForExercise, type CatalogExercise } from '@/domain/exercises';
import type { PdfImageRef } from '@/domain/pdf';
import { BASE_PATHS, VIEW_PATHS, VIEWBOX, intensitiesFromLoad, type MuscleIntensities } from '@/ui/MuscleMap';
import { paletteFill, type MuscleMapPalette } from '@/services/model3d/palette';

const MIRROR = `matrix(-1 0 0 1 ${VIEWBOX.width} 0)`;

/** Front + back body map as a standalone SVG string with concrete colours (no CSS variables). */
export function muscleMapSvg(intensities: MuscleIntensities, palette: MuscleMapPalette): string {
  const fig = (view: 'front' | 'back', dx: number) => {
    const base = BASE_PATHS.map((d) => `<path d="${d}"/>`).join('');
    const regions = VIEW_PATHS[view]
      .map(([id, paths]) => {
        const fill = paletteFill(intensities[id], palette);
        const ps = paths.map((d) => `<path d="${d}"/>`).join('');
        return `<g fill="${fill}">${ps}<g transform="${MIRROR}">${ps}</g></g>`;
      })
      .join('');
    return `<g transform="translate(${dx} 0)"><g fill="${palette.base}">${base}<g transform="${MIRROR}">${base}</g></g>${regions}</g>`;
  };
  const w = VIEWBOX.width * 2 + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 3}" height="${VIEWBOX.height * 3}" viewBox="0 0 ${w} ${VIEWBOX.height}">${fig('front', 0)}${fig('back', VIEWBOX.width + 10)}</svg>`;
}

async function svgToPng(svg: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 630;
    canvas.height = img.naturalHeight || 690;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** PNG muscle maps (one per exercise) for the PDF's "خريطة العضلات" next to each exercise. */
export async function muscleMapRefs(exercises: readonly CatalogExercise[], brand: string): Promise<Map<string, PdfImageRef>> {
  const palette: MuscleMapPalette = { base: '#e5e5ea', off: '#d1d1d6', hit: brand };
  const out = new Map<string, PdfImageRef>();
  const cache = new Map<string, string | null>();
  for (const e of exercises) {
    const svg = muscleMapSvg(intensitiesFromLoad(muscleLoadForExercise(e)), palette);
    if (!cache.has(svg)) cache.set(svg, await svgToPng(svg));
    const url = cache.get(svg);
    if (url) out.set(e.id, { kind: 'url', url });
  }
  return out;
}
