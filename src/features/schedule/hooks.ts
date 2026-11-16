import { useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { deviceZone } from './zone';
import { createScheduleWriter } from './scheduleWriter';

/** Re-renders once a minute so "today" and the next session stay right while the screen is open. */
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function useScheduleWriter() {
  const { data, meta } = useServices();
  return useMemo(() => createScheduleWriter({ repos: data.repos, meta, clock: deviceZone().clock }), [data, meta]);
}
