import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

// Routes for the training feature area (children of '/').
export const trainingRoutes: RouteObject[] = [
  { path: 'exercises', ...screen(() => import('@/features/exercises/ExercisesScreen'), 'ExercisesScreen') },
  {
    path: 'exercises/:exerciseId',
    ...screen(() => import('@/features/exercises/ExerciseDetailScreen'), 'ExerciseDetailScreen'),
  },
  { path: 'more/muscle-map', ...screen(() => import('@/features/muscleMap/MuscleMapScreen'), 'MuscleMapScreen') },
  { path: 'more/programs', ...screen(() => import('@/features/programs/ProgramsScreen'), 'ProgramsScreen') },
  { path: 'programs/:programId', ...screen(() => import('@/features/programs/ProgramBuilderScreen'), 'ProgramBuilderScreen') },
  { path: 'session/:key', ...screen(() => import('@/features/session/SessionScreen'), 'SessionScreen') },
];
