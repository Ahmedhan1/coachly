import { useState } from 'react';
import { foodIconHex, foodIconUrl, type IngredientEntry } from '@/domain/meals';
import { cx } from '@/ui';
import { StoredImage } from './StoredImage';
import { foodPhotoUrl } from './foodPhotos';
import styles from './FoodImage.module.css';

interface FoodImageProps {
  /** The trainer's photo wins; then the bundled photo; otherwise the bundled illustration (by icon hex, or from the food / category). */
  imageId?: string | null | undefined;
  /** Bundled photo file stem (public/food-img/photos). A food passed in `food` brings its own. */
  photo?: string | undefined;
  icon?: string | undefined;
  food?: Pick<IngredientEntry, 'icon' | 'category' | 'photo'> | undefined;
  className?: string | undefined;
}

/**
 * A food's or recipe's picture: the trainer's own photo, else the bundled food photo (cached on first view), else
 * the bundled Twemoji illustration (precached, always offline). A photo that fails to load falls back to the icon.
 */
export function FoodImage({ imageId, photo, icon, food, className }: FoodImageProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (imageId) return <StoredImage imageId={imageId} alt="" className={cx(styles.box, className)} lazy />;
  const stem = photo ?? food?.photo;
  if (stem && failed !== stem) {
    return (
      <span className={cx(styles.box, styles.photo, className)}>
        <img src={foodPhotoUrl(stem)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(stem)} />
      </span>
    );
  }
  const hex = icon ?? foodIconHex(food ?? {});
  return (
    <span className={cx(styles.box, styles.icon, className)}>
      <img src={foodIconUrl(hex)} alt="" loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
