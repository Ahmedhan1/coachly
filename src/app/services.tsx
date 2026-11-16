import { createContext, useContext, type ReactNode } from 'react';
import type { DataLayer } from '@/data';
import type { ActivationService } from '@/services/activation/types';
import type { StorageService } from '@/services/storage';

export interface AppServices {
  data: DataLayer;
  storage: StorageService;
  activation: ActivationService;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider missing');
  return services;
}

export const useRepos = () => useServices().data.repos;
