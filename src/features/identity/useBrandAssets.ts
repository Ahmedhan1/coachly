import { useEffect } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { refreshBrandAssets } from './brandAssets';

/** Keeps the launch splash and home-screen icons in step with the logo and colour (e.g. after a restore). */
export function useBrandAssets(active: boolean): void {
  const services = useServices();
  const settings = useLive(() => services.data.repos.settings.get(), [services]);
  const source = settings ? `${settings.logoImageId ?? ''}|${settings.primaryColor}` : null;
  useEffect(() => {
    if (!active || source === null) return;
    void refreshBrandAssets(services).catch(() => false);
  }, [active, source, services]);
}
