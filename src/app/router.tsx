import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell, RouteFallback } from './AppShell';
import { screen } from './screen';
import { nutritionRoutes } from './routes/nutrition';
import { scheduleRoutes } from './routes/schedule';
import { trainingRoutes } from './routes/training';

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
      { path: 'more/pdf', ...screen(() => import('@/features/pdf/PdfBuilderScreen'), 'PdfBuilderScreen') },
      { path: 'more/settings', ...screen(() => import('@/features/settings/SettingsScreen'), 'SettingsScreen') },
      { path: 'more/settings/backup', ...screen(() => import('@/features/settings/BackupScreen'), 'BackupScreen') },
      { path: 'more/settings/storage', ...screen(() => import('@/features/storage/StorageScreen'), 'StorageScreen') },
      { path: 'more/assistant', ...screen(() => import('@/features/assistant/AssistantScreen'), 'AssistantScreen') },
      { path: 'more/settings/notifications', ...screen(() => import('@/features/settings/NotificationsScreen'), 'NotificationsScreen') },
      { path: 'more/settings/formulas', ...screen(() => import('@/features/settings/FormulasScreen'), 'FormulasScreen') },
      { path: 'more/settings/integrations', ...screen(() => import('@/features/settings/IntegrationsScreen'), 'IntegrationsScreen') },
      { path: 'more/settings/about', ...screen(() => import('@/features/settings/AboutScreen'), 'AboutScreen') },
      {
        path: 'more/settings/identity',
        ...screen(() => import('@/features/identity/IdentityEditScreen'), 'IdentityEditScreen'),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
