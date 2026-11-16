import { useEffect } from 'react';
import type { TrainerSettings } from '@/domain/models';
import { brandPalette } from '@/ui/color';

/** Pushes the trainer's brand color into the CSS tokens (light and dark variants). */
export function useBrandTheme(settings: TrainerSettings | undefined): void {
  const primary = settings?.primaryColor;
  useEffect(() => {
    if (!primary) return;
    const palette = brandPalette(primary);
    const style = document.documentElement.style;
    style.setProperty('--brand-base', palette.light);
    style.setProperty('--on-brand-light', palette.onLight);
    style.setProperty('--brand-on-dark', palette.dark);
    style.setProperty('--on-brand-dark', palette.onDark);
  }, [primary]);
}
