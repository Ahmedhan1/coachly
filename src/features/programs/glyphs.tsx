import { Icon } from '@/ui';
import styles from './Shared.module.css';

/** Program-area icons; thin wrapper over the shared filled icon set. */
const NAMES = { grip: 'grip', link: 'link', swap: 'swap', skip: 'skip', minus: 'minus' } as const;

export type GlyphName = keyof typeof NAMES;

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return <Icon name={NAMES[name]} className={[styles.glyph, name === 'grip' ? styles.grip : '', className ?? ''].filter(Boolean).join(' ')} />;
}
