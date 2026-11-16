import type { RouteObject } from 'react-router-dom';
import { screen } from '../screen';

const placeholders = () => import('@/features/placeholders/PlaceholderScreens');

// Routes for the schedule feature area (children of '/'). Replace each placeholder with the real screen.
export const scheduleRoutes: RouteObject[] = [
  { path: 'schedule', ...screen(placeholders, 'ScheduleScreen') },
];
