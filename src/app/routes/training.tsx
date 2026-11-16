import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

const placeholders = () => import('@/features/placeholders/PlaceholderScreens');

// Routes for the training feature area (children of '/'). Replace each placeholder with the real screen.
export const trainingRoutes: RouteObject[] = [
  { path: 'exercises', ...screen(() => import('@/features/exercises/ExercisesScreen'), 'ExercisesScreen') },
  {
    path: 'exercises/:exerciseId',
    ...screen(() => import('@/features/exercises/ExerciseDetailScreen'), 'ExerciseDetailScreen'),
  },
  { path: 'more/muscle-map', ...screen(() => import('@/features/muscleMap/MuscleMapScreen'), 'MuscleMapScreen') },
  { path: 'more/programs', ...screen(placeholders, 'ProgramsScreen') },
];
