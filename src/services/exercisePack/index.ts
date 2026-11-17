export * from './types';
export { BrowserExercisePackService, isExercisePack, type PackServiceDeps } from './browserExercisePackService';

import { BrowserExercisePackService } from './browserExercisePackService';

/** App-wide instance (the manifest is loaded once per run). */
export const exercisePackService = new BrowserExercisePackService();
