import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

// Routes for the schedule feature area (children of '/'): schedule, income dashboard, WhatsApp templates.
export const scheduleRoutes: RouteObject[] = [
  { path: 'schedule', ...screen(() => import('@/features/schedule/ScheduleScreen'), 'ScheduleScreen') },
  { path: 'more/outbox', ...screen(() => import('@/features/outbox/OutboxScreen'), 'OutboxScreen') },
  { path: 'more/income', ...screen(() => import('@/features/income/IncomeScreen'), 'IncomeScreen') },
  {
    path: 'more/whatsapp-templates',
    ...screen(() => import('@/features/whatsapp/WhatsappTemplatesScreen'), 'WhatsappTemplatesScreen'),
  },
];
