import { useEffect } from 'react';
import { deriveBrand, normalizeHex, type BrandTheme, type BrandTokens } from '@/domain/branding';

const SUFFIX: Record<keyof BrandTokens, string> = {
  brand: '--rt-brand',
  brandOn: '--rt-brand-on',
  brandInk: '--rt-brand-ink',
  brandTint: '--rt-brand-tint',
  brandTintStrong: '--rt-brand-tint-strong',
};

/** CSS custom properties read by src/ui/tokens.css (light names, plus `-dark` variants). */
export function brandCssVariables(theme: BrandTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of Object.keys(SUFFIX) as Array<keyof BrandTokens>) {
    vars[SUFFIX[key]] = theme.light[key];
    vars[`${SUFFIX[key]}-dark`] = theme.dark[key];
  }
  return vars;
}

/** Writes the derived brand tokens onto `element` (default :root); invalid colors leave the defaults. */
export function applyBrand(color: string | undefined, element: HTMLElement = document.documentElement): void {
  const hex = color ? normalizeHex(color) : null;
  if (!hex) return;
  for (const [name, value] of Object.entries(brandCssVariables(deriveBrand(hex)))) element.style.setProperty(name, value);
}

/** Pushes the trainer's brand color into the CSS tokens (light and dark variants). */
export function useBrandTheme(color: string | undefined): void {
  useEffect(() => applyBrand(color), [color]);
}
