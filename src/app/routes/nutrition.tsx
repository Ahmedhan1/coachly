import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

const placeholders = () => import('@/features/placeholders/PlaceholderScreens');

// Routes for the nutrition feature area (children of '/'). Replace each placeholder with the real screen.
export const nutritionRoutes: RouteObject[] = [
  { path: 'more/nutrition', ...screen(placeholders, 'NutritionScreen') },
  { path: 'more/supplements', ...screen(placeholders, 'SupplementsScreen') },
  { path: 'more/progress', ...screen(placeholders, 'ProgressScreen') },
];
