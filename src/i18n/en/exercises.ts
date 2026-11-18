// English for src/i18n/features/exercises.ts (exercise detail extras).
import type { EnArea } from './types';

export const exercises: EnArea<'exercises'> = {
  detail: {
    cues: 'Coaching cues',
    cuesHint: 'Quick points to remind the client during the exercise.',
    illustration: 'Target muscles',
    illustrationAlt: 'Target muscles drawing for {name}',
    illustrationLegend: 'Dark: primary muscle, light: secondary muscles',
    illustrationSlide: 'Muscle drawing',
    illustrationShort: 'Muscles',
    photoCredit: 'Image: {credit}',
    clients: 'Your clients doing this exercise',
    clientsHint: 'Clients who have this exercise in their program.',
    clientsPrograms: 'In program: {programs}',
    alternativesHint: 'Same primary muscle; closest movement and equipment first.',
  },
  names: {
    nameAr: 'Arabic name',
    nameEn: 'English name (optional)',
    nameEnHint: 'Shown when the app language is English.',
    nameEnDefault: 'Leave empty for the original name: {name}',
  },
};
