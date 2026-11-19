// English for src/i18n/features/files.ts (client photo, trainer photo, payment receipts, PDF archive).
import type { EnArea } from './types';

export const files: EnArea<'files'> = {
  clientPhoto: {
    add: 'Add photo',
    change: 'Change photo',
    remove: 'Remove photo',
    alt: 'Photo of {name}',
    processing: 'Preparing the photo…',
    failed: 'This photo did not open. Try another one.',
    saved: 'Saved the photo of {name}',
    removed: 'Photo removed',
    arrived: 'New photo from {name}',
    arrivedMany: '{n} new photos from clients',
  },
  trainerPhoto: {
    title: 'Your photo',
    lead: 'Optional. Clients see it on their page next to the logo.',
    pick: 'Choose your photo',
    change: 'Change your photo',
    remove: 'Remove your photo',
    alt: 'Your photo',
  },
  invoice: {
    label: 'Receipt photo',
    hint: 'Optional: an InstaPay or Vodafone Cash screenshot, or a photo of the receipt.',
    attach: 'Attach a photo',
    change: 'Change photo',
    remove: 'Remove photo',
    alt: 'Payment receipt',
    attached: 'Receipt attached',
  },
  pdfArchive: {
    title: 'Files sent before',
    lead: 'An encrypted copy of every PDF is kept online, so you can open it again from any phone after a restore.',
    open: 'Open',
    opening: 'Opening the file…',
    openFailed: 'Could not open the file right now. Check the internet and try again.',
    pending: 'Uploads as soon as the internet is back',
    empty: 'No files yet.',
  },
};
