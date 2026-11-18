// Types for scripts/build-exercise-pack.mjs (used by its test).
import type { DatasetExercise, ExercisePack } from '../src/domain/exercises/pack';

export interface PackBuildOptions {
  source: string;
  names: string;
  cache: string;
  out: string;
  size: number;
  quality: number;
  format: 'webp' | 'jpeg';
  concurrency: number;
  retries: number;
  limit: number;
  budgetMb: number;
  offline: boolean;
  /** Rewrite exercises.json from data-src only, keeping the existing image list (no image work). */
  manifestOnly: boolean;
  namesEn: string;
  cuesEn: string;
  /** data-src/exercise-fixes.json (hand-reviewed photo / muscle / joint corrections). Optional. */
  fixes?: string;
}

export interface PlannedImage {
  id: string;
  remotePath: string;
  url: string;
  outName: string;
}

export interface PackBuildResult {
  pack: ExercisePack;
  imageCount: number;
  totalImages: number;
  missing: number;
  fetched: number;
  encoded: number;
  failures: string[];
  totalBytes: number;
  overBudget: boolean;
}

export interface ImageEncoder {
  name: string;
  encode(src: string, dst: string, size: number, quality: number): Promise<unknown>;
}

export const REMOTE_BASE: string;
export const SOURCE_LABEL: string;
export const DEFAULTS: Readonly<PackBuildOptions>;
export class PermanentError extends Error {}
export function parseArgs(argv: readonly string[], root?: string): PackBuildOptions;
export function planImages(sources: ReadonlyArray<Pick<DatasetExercise, 'id' | 'images'>>, format: 'webp' | 'jpeg'): PlannedImage[];
export function runPool<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
export function withRetry<R>(
  fn: (attempt: number) => Promise<R>,
  options: { retries: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<R>;
export function formatBytes(bytes: number): string;
export function detectEncoder(format: 'webp' | 'jpeg'): Promise<ImageEncoder | null>;
export function serializePack(pack: ExercisePack): string;
export function buildPack(options: PackBuildOptions, log?: (line: string) => void): Promise<PackBuildResult>;
