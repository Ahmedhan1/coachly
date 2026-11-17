import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

// Routes for the nutrition feature area (children of '/').
export const nutritionRoutes: RouteObject[] = [
  { path: 'more/nutrition', ...screen(() => import('@/features/nutrition/hub/NutritionHubScreen'), 'NutritionHubScreen') },
  { path: 'more/foods', ...screen(() => import('@/features/nutrition/foods/FoodsScreen'), 'FoodsScreen') },
  { path: 'more/recipes', ...screen(() => import('@/features/nutrition/recipes/RecipesScreen'), 'RecipesScreen') },
  { path: 'more/supplements', ...screen(() => import('@/features/nutrition/supplements/SupplementsScreen'), 'SupplementsScreen') },
  { path: 'more/progress', ...screen(() => import('@/features/nutrition/progress/ProgressHubScreen'), 'ProgressHubScreen') },
  { path: 'clients/:clientId/nutrition', ...screen(() => import('@/features/nutrition/calculator/CalculatorScreen'), 'CalculatorScreen') },
  { path: 'clients/:clientId/meals', ...screen(() => import('@/features/nutrition/meals/MealPlanScreen'), 'MealPlanScreen') },
  { path: 'clients/:clientId/diet', ...screen(() => import('@/features/nutrition/diet/DietScreen'), 'DietScreen') },
  { path: 'clients/:clientId/supplements', ...screen(() => import('@/features/nutrition/supplements/ClientSupplementsScreen'), 'ClientSupplementsScreen') },
  { path: 'clients/:clientId/progress', ...screen(() => import('@/features/nutrition/progress/ClientProgressScreen'), 'ClientProgressScreen') },
];
