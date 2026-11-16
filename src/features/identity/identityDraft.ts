import { useCallback, useEffect, useState } from 'react';
import { IDENTITY_SETUP_KEY, useServices } from '@/app/services';
import { DEFAULT_BRAND } from '@/domain/branding';
import type { TrainerSettings } from '@/domain/models';

export const CURRENCIES = ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'USD', 'EUR'] as const;

export interface IdentityDraft {
  name: string;
  logoImageId: string | null;
  color: string;
  currency: string;
  weight: TrainerSettings['units']['weight'];
  length: TrainerSettings['units']['length'];
}

/** The shipped domain default predates direction B; first-run setup starts from the B signal orange. */
const LEGACY_DEFAULT_COLOR = '#2F6F5E';

export function draftFrom(settings: TrainerSettings, firstRun: boolean): IdentityDraft {
  const color = firstRun && settings.primaryColor.toUpperCase() === LEGACY_DEFAULT_COLOR ? DEFAULT_BRAND : settings.primaryColor;
  return {
    name: settings.name,
    logoImageId: settings.logoImageId,
    color: color.toUpperCase(),
    currency: settings.currency,
    weight: settings.units.weight,
    length: settings.units.length,
  };
}

/** Loads the draft from settings and saves it back (plus the "setup done" flag). */
export function useIdentityDraft(firstRun: boolean) {
  const { data, meta } = useServices();
  const [draft, setDraft] = useState<IdentityDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    void data.repos.settings.get().then((s) => !cancelled && setDraft(draftFrom(s, firstRun)));
    return () => {
      cancelled = true;
    };
  }, [data, firstRun]);

  const update = useCallback((patch: Partial<IdentityDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);

  const save = useCallback(
    async (value: IdentityDraft) => {
      await data.repos.settings.update({
        name: value.name.trim(),
        logoImageId: value.logoImageId as TrainerSettings['logoImageId'],
        primaryColor: value.color,
        currency: value.currency,
        units: { weight: value.weight, length: value.length },
      });
      await meta.set(IDENTITY_SETUP_KEY, Date.now());
    },
    [data, meta],
  );

  return { draft, update, save };
}
