import { useCallback, useEffect, useState } from 'react';
import { IDENTITY_SETUP_KEY, useServices } from '@/app/services';
import { DEFAULT_BRAND } from '@/domain/branding';
import type { TrainerSettings } from '@/domain/models';
import { dropCopies, queueImageCopy } from '@/features/files/cloudCopies';

export const CURRENCIES = ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'USD', 'EUR'] as const;

export interface IdentityDraft {
  name: string;
  logoImageId: string | null;
  /** The trainer's own photo (optional). */
  photoImageId: string | null;
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
    photoImageId: settings.photoImageId ?? null,
    color: color.toUpperCase(),
    currency: settings.currency,
    weight: settings.units.weight,
    length: settings.units.length,
  };
}

/** Loads the draft from settings and saves it back (plus the "setup done" flag). */
export function useIdentityDraft(firstRun: boolean) {
  const services = useServices();
  const { data, meta } = services;
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
      const before = (await data.repos.settings.get()).photoImageId ?? null;
      await data.repos.settings.update({
        name: value.name.trim(),
        logoImageId: value.logoImageId as TrainerSettings['logoImageId'],
        photoImageId: value.photoImageId as TrainerSettings['logoImageId'],
        primaryColor: value.color,
        currency: value.currency,
        units: { weight: value.weight, length: value.length },
      });
      await meta.set(IDENTITY_SETUP_KEY, Date.now());
      // Encrypted cloud copy of the trainer's photo (one per account).
      if (value.photoImageId !== before) {
        if (value.photoImageId) await queueImageCopy(services, 'trainer_photo', null, value.photoImageId);
        else await dropCopies(services, null, ['trainer_photo']);
        if (before) await data.repos.images.delete(before).catch(() => undefined);
      }
    },
    [data, meta, services],
  );

  return { draft, update, save };
}
