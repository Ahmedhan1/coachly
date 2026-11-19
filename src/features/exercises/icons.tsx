import { Icon } from '@/ui';

/** Favourite star: filled when on, outline when off (the one outline icon, to show the state). */
export function StarIcon({ filled }: { filled: boolean }) {
  return <Icon name={filled ? 'star' : 'starOutline'} />;
}

export function FilterIcon() {
  return <Icon name="filter" />;
}

export function DownloadIcon() {
  return <Icon name="download" />;
}
