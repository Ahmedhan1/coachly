import { foodIconHex, foodIconUrl, type IngredientEntry } from '@/domain/meals';
import { cx } from '@/ui';
import { StoredImage } from './StoredImage';
import styles from './FoodImage.module.css';

interface FoodImageProps {
  /** The trainer's photo wins; otherwise the bundled illustration (by icon hex, or from the food / category). */
  imageId?: string | null;
  icon?: string;
  food?: Pick<IngredientEntry, 'icon' | 'category'>;
  className?: string;
}

/** A food's picture: the trainer's own photo, else the bundled Twemoji illustration (served offline). */
export function FoodImage({ imageId, icon, food, className }: FoodImageProps) {
  if (imageId) return <StoredImage imageId={imageId} alt="" className={cx(styles.box, className)} lazy />;
  const hex = icon ?? foodIconHex(food ?? {});
  return (
    <span className={cx(styles.box, styles.icon, className)}>
      <img src={foodIconUrl(hex)} alt="" loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
