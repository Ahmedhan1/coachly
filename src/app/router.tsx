import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell, RouteFallback } from './AppShell';
import { screen } from './screen';
import { nutritionRoutes } from './routes/nutrition';
import { scheduleRoutes } from './routes/schedule';
import { trainingRoutes } from './routes/training';

const placeholders = () => import('@/features/placeholders/PlaceholderScreens');

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    hydrateFallbackElement: <RouteFallback />,
    children: [
      { index: true, ...screen(() => import('@/features/home/HomeScreen'), 'HomeScreen') },
      ...scheduleRoutes,
      ...trainingRoutes,
      ...nutritionRoutes,
      { path: 'clients', ...screen(() => import('@/features/clients/ClientsListScreen'), 'ClientsListScreen') },
      { path: 'clients/:clientId', ...screen(() => import('@/features/clients/ClientDetailScreen'), 'ClientDetailScreen') },
      { path: 'more', ...screen(() => import('@/features/more/MoreScreen'), 'MoreScreen') },
      { path: 'more/pdf', ...screen(placeholders, 'PdfScreen') },
      { path: 'more/settings', ...screen(() => import('@/features/settings/SettingsScreen'), 'SettingsScreen') },
      {
        path: 'more/settings/identity',
        ...screen(() => import('@/features/identity/IdentityEditScreen'), 'IdentityEditScreen'),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
