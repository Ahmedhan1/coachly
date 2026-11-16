/**
 * Test-only page (served by the Vite dev server, never linked from the app): renders the five spec test
 * PDFs with the real HtmlPdfRenderer, real fonts and real exercise-pack photos. Driven by pdfSamples.pw.ts.
 */
import { isMuscleGroupId, muscleGroupLabelAr } from '@/domain/exercises/labels';
import type { PdfExercise, PdfImageRef } from '@/domain/pdf';
import { FIXTURE_IMAGE_IDS, pdfTestCase, PDF_TEST_CASES, type PdfTestCaseId } from '@/domain/pdf/fixtures';
import { HtmlPdfRenderer } from '../htmlPdfRenderer';
import { createImageSource } from '../images';

interface PackEntry {
  id: string;
  en: string;
  ar: string;
  primary: string[];
  images: string[];
}

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, type: string): Promise<Blob> {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  draw(el.getContext('2d')!);
  return new Promise((resolve) => el.toBlob((b) => resolve(b!), type, 0.9));
}

/** Synthetic pictures, deliberately oversized so the ≤1200 px downscale path is exercised. */
async function fixtureImages(): Promise<Map<string, Blob>> {
  const m = new Map<string, Blob>();
  m.set(
    FIXTURE_IMAGE_IDS.logo,
    await canvas(1800, 900, (c) => {
      c.fillStyle = '#8A1C7C';
      c.beginPath();
      c.arc(450, 450, 400, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 380px sans-serif';
      c.fillText('S', 330, 590);
      c.fillStyle = '#8A1C7C';
      c.font = 'bold 260px sans-serif';
      c.fillText('COACH', 900, 560);
    }, 'image/png'),
  );
  const photo = (hue: number) => (c: CanvasRenderingContext2D) => {
    const g = c.createLinearGradient(0, 0, 3024, 4032);
    g.addColorStop(0, `hsl(${hue},45%,70%)`);
    g.addColorStop(1, `hsl(${hue + 60},50%,35%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 3024, 4032);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `hsla(${hue + i * 7},60%,${30 + (i % 5) * 10}%,.35)`;
      c.beginPath();
      c.arc((i * 733) % 3024, (i * 1291) % 4032, 120 + (i % 7) * 60, 0, Math.PI * 2);
      c.fill();
    }
  };
  m.set(FIXTURE_IMAGE_IDS.background, await canvas(3024, 4032, photo(150), 'image/jpeg'));
  m.set(FIXTURE_IMAGE_IDS.cover, await canvas(3024, 4032, photo(290), 'image/jpeg'));
  m.set(FIXTURE_IMAGE_IDS.before, await canvas(3024, 4032, photo(20), 'image/jpeg'));
  m.set(FIXTURE_IMAGE_IDS.after, await canvas(3024, 4032, photo(200), 'image/jpeg'));
  m.set(FIXTURE_IMAGE_IDS.recipe, await canvas(1600, 1200, photo(40), 'image/jpeg'));
  m.set(FIXTURE_IMAGE_IDS.supplement, await canvas(800, 800, photo(250), 'image/png'));
  return m;
}

/** Stand-in for the 3D snapshot: a simple figure with the target region coloured. */
async function muscleMap(index: number): Promise<Blob> {
  return canvas(400, 400, (c) => {
    c.fillStyle = '#fafafa';
    c.fillRect(0, 0, 400, 400);
    c.fillStyle = '#d1d1d6';
    c.beginPath();
    c.arc(200, 60, 36, 0, Math.PI * 2);
    c.fill();
    c.fillRect(150, 100, 100, 160);
    c.fillRect(110, 105, 36, 130);
    c.fillRect(254, 105, 36, 130);
    c.fillRect(155, 262, 40, 130);
    c.fillRect(205, 262, 40, 130);
    c.fillStyle = '#e0483c';
    const regions = [[150, 100, 100, 60], [155, 262, 40, 90], [110, 105, 36, 60], [150, 170, 100, 60]] as const;
    const r = regions[index % regions.length]!;
    c.fillRect(r[0], r[1], r[2], r[3]);
  }, 'image/png');
}

async function exercises(): Promise<{ map: Map<string, PdfExercise>; maps: Map<string, Blob> }> {
  const pack = (await (await fetch('/exercise-pack/exercises.json')).json()) as { exercises: PackEntry[] };
  const chosen = pack.exercises.filter((e) => e.images.length > 0 && e.primary.some(isMuscleGroupId)).filter((_, i) => i % 17 === 0).slice(0, 50);
  const map = new Map<string, PdfExercise>();
  const maps = new Map<string, Blob>();
  for (let i = 0; i < chosen.length; i++) {
    const e = chosen[i]!;
    const mapUrl = `map-${i % 4}`;
    if (!maps.has(mapUrl)) maps.set(mapUrl, await muscleMap(i));
    const image: PdfImageRef = { kind: 'pack', path: e.images[0]! };
    map.set(e.id, {
      name: e.ar,
      secondaryName: e.en,
      muscles: e.primary.filter(isMuscleGroupId).map(muscleGroupLabelAr),
      image,
      muscleMap: { kind: 'url', url: mapUrl },
    });
  }
  return { map, maps };
}

export interface HarnessResult {
  id: PdfTestCaseId;
  ok: boolean;
  error?: string;
  pages: number;
  bytes: number;
  ms: number;
  base64: string;
  heapMB: number | null;
}

async function setup() {
  const [images, ex] = await Promise.all([fixtureImages(), exercises()]);
  const source = createImageSource({
    getStoredBlob: async (id) => images.get(id),
    packBaseUrl: '/exercise-pack/img/',
    fetchFn: async (url) => {
      const local = ex.maps.get(url);
      return local ? new Response(local) : fetch(url);
    },
  });
  return { source, exercises: ex.map };
}

let ready: ReturnType<typeof setup> | null = null;

async function render(id: PdfTestCaseId): Promise<HarnessResult> {
  ready ??= setup();
  const { source, exercises: ex } = await ready;
  const input = pdfTestCase(id, id === 'fifty_exercises' ? ex : new Map([...ex].slice(0, 12)));
  const renderer = new HtmlPdfRenderer({ images: source, fontBaseUrl: '/fonts/' });
  const t0 = performance.now();
  const r = await renderer.render(input);
  const ms = Math.round(performance.now() - t0);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
  if (!r.ok) return { id, ok: false, error: r.error, pages: 0, bytes: 0, ms, base64: '', heapMB };
  const bytes = new Uint8Array(await r.value.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { id, ok: true, pages: r.value.pageCount, bytes: bytes.length, ms, base64: btoa(bin), heapMB };
}

declare global {
  interface Window {
    __pdfHarness?: { cases: readonly PdfTestCaseId[]; render: (id: PdfTestCaseId) => Promise<HarnessResult> };
  }
}

window.__pdfHarness = { cases: PDF_TEST_CASES, render };
document.getElementById('status')!.textContent = 'ready';
