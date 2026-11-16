import { createContext, useContext, type ReactNode } from 'react';
import type { DataLayer } from '@/data';
import type { ActivationService } from '@/services/activation/types';
import type { MetaStore } from '@/services/license/metaStore';
import type { ImageDownscaler, StorageService } from '@/services/storage';

export interface AppServices {
  data: DataLayer;
  storage: StorageService;
  activation: ActivationService;
  /** App flags (e.g. identity setup done) in the same database as the data. */
  meta: MetaStore;
  images: ImageDownscaler;
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

/** Meta key: set once the trainer finished or skipped first-run identity setup. */
export const IDENTITY_SETUP_KEY = 'identity.setupDoneAt';
