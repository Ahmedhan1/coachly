/** Reps target of a program item. Stored as text in the Program schema ("10", "8-10", "AMRAP"). */
export type RepsSpec = { kind: 'single'; value: number } | { kind: 'range'; min: number; max: number } | { kind: 'text'; text: string };

const RANGE = /^\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*$/;
const SINGLE = /^\s*(\d{1,3})\s*$/;

export function parseReps(text: string): RepsSpec {
  const range = RANGE.exec(text);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a === b) return { kind: 'single', value: a };
    return { kind: 'range', min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = SINGLE.exec(text);
  if (single) return { kind: 'single', value: Number(single[1]) };
  return { kind: 'text', text: text.trim() };
}

/** Canonical stored form: "10", "8-10" (ASCII hyphen), or the trimmed free text. */
export function formatReps(spec: RepsSpec): string {
  switch (spec.kind) {
    case 'single':
      return String(spec.value);
    case 'range':
      return spec.min === spec.max ? String(spec.min) : `${Math.min(spec.min, spec.max)}-${Math.max(spec.min, spec.max)}`;
    case 'text':
      return spec.text.trim();
  }
}

/** For display: ranges use an en dash ("8–10"); render inside an LTR isolate. */
export function displayReps(text: string): string {
  const spec = parseReps(text);
  return spec.kind === 'range' ? `${spec.min}–${spec.max}` : formatReps(spec);
}

/** Rep count to pre-fill in session mode: the single value, the top of a range, or null for free text. */
export function targetReps(text: string): number | null {
  const spec = parseReps(text);
  if (spec.kind === 'single') return spec.value;
  if (spec.kind === 'range') return spec.max;
  return null;
}

/** Normalises what the trainer typed for tempo: "3110" → "3-1-1-0", keeps "3-1-1-0", '' stays ''. */
export function normalizeTempo(input: string): string {
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  if (compact === '') return '';
  if (/^[\dX]{1,4}$/.test(compact)) return compact.split('').join('-');
  return input.trim();
}

/** "3-1-1-0" → "3110" (how the design shows tempo in chips). */
export function compactTempo(tempo: string): string {
  return tempo.replace(/-/g, '');
}
