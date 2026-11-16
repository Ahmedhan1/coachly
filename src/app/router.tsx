import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell, RouteFallback } from './AppShell';

/** Lazy-loads a named screen export so every feature is its own chunk. */
const screen = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) => ({
  lazy: async () => ({ Component: (await load())[name] as ComponentType }),
});

const placeholders = () => import('@/features/placeholders/PlaceholderScreens');

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    hydrateFallbackElement: <RouteFallback />,
    children: [
      { index: true, ...screen(() => import('@/features/home/HomeScreen'), 'HomeScreen') },
      { path: 'clients', ...screen(() => import('@/features/clients/ClientsListScreen'), 'ClientsListScreen') },
      { path: 'clients/:clientId', ...screen(() => import('@/features/clients/ClientDetailScreen'), 'ClientDetailScreen') },
      { path: 'schedule', ...screen(placeholders, 'ScheduleScreen') },
      { path: 'exercises', ...screen(placeholders, 'ExercisesScreen') },
      { path: 'more', ...screen(() => import('@/features/more/MoreScreen'), 'MoreScreen') },
      { path: 'more/muscle-map', ...screen(placeholders, 'MuscleMapScreen') },
      { path: 'more/programs', ...screen(placeholders, 'ProgramsScreen') },
      { path: 'more/nutrition', ...screen(placeholders, 'NutritionScreen') },
      { path: 'more/supplements', ...screen(placeholders, 'SupplementsScreen') },
      { path: 'more/progress', ...screen(placeholders, 'ProgressScreen') },
      { path: 'more/pdf', ...screen(placeholders, 'PdfScreen') },
      { path: 'more/settings', ...screen(placeholders, 'SettingsScreen') },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
