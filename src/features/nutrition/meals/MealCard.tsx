import { itemTotals, mealTotals, type MacroTotals } from '@/domain/meals';
import type { Meal } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Icon, IconButton, Num, Tx } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import { kcalText } from '../shared/numbers';
import styles from './MealPlan.module.css';

interface MealCardProps {
  meal: Meal;
  lookup: ReadonlyMap<string, MacroTotals>;
  names: ReadonlyMap<string, string>;
  /** Photo / illustration per recipe id. */
  images: ReadonlyMap<string, { imageId: string | null; icon: string }>;
  onAdd: () => void;
  onSwap: (index: number) => void;
  onRemoveItem: (index: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MealCard({ meal, lookup, names, images, onAdd, onSwap, onRemoveItem, onEdit, onDelete }: MealCardProps) {
  const total = mealTotals(meal, lookup).totals.kcal;
  return (
    <section className={styles.meal} aria-label={meal.name}>
      <header className={styles.mealHead}>
        <button type="button" className={styles.mealName} onClick={onEdit} aria-label={t('nutrition.plan.editMeal', { name: meal.name })}>
          <h3>{meal.name}</h3>
          {meal.time && <bdi className="num">{meal.time}</bdi>}
        </button>
        <p className={styles.mealKcal}>
          <Num>{kcalText(total)}</Num> {t('nutrition.units.kcal')}
        </p>
        <IconButton icon="trash" tone="muted" label={t('nutrition.plan.deleteMeal', { name: meal.name })} onClick={onDelete} />
      </header>
      {meal.items.length === 0 && <p className={styles.mealEmpty}>{t('nutrition.plan.mealEmpty')}</p>}
      <ul className={styles.items}>
        {meal.items.map((item, index) => {
          const name = item.recipeId ? (names.get(item.recipeId) ?? t('nutrition.plan.missingRecipe')) : item.text;
          const r = itemTotals(item, lookup);
          return (
            <li key={`${item.recipeId ?? item.text}-${index}`} className={styles.item}>
              {item.recipeId && <FoodImage imageId={images.get(item.recipeId)?.imageId} icon={images.get(item.recipeId)?.icon} className={styles.itemImg} />}
              <div className={styles.itemText}>
                <p className={styles.itemName}>{name}</p>
                {item.lines && item.lines.length > 0 ? (
                  <ul className={styles.lines}>
                    {item.lines.map((l, li) => (
                      <li key={`${l.name}-${li}`}>
                        <span>{pick(l.name, l.nameEn)}</span>
                        <span>
                          {l.units !== undefined && l.unitLabel ? (
                            <Tx k="nutrition.plan.lineUnits" params={{ n: l.units, unit: pick(l.unitLabel, l.unitLabelEn), g: l.grams }} />
                          ) : (
                            <Tx k="nutrition.plan.lineGrams" params={{ g: l.grams }} />
                          )}
                          {' · '}
                          <Num>{kcalText(l.kcal)}</Num> {t('nutrition.units.kcal')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className={styles.itemSub}>
                  {!item.lines?.length && (
                    <>
                      <Num>{item.servings}</Num> {t('nutrition.plan.servingShort')}
                    </>
                  )}
                  {r.counted && (
                    <>
                      {!item.lines?.length && ' · '}
                      <Num>{kcalText(r.totals.kcal)}</Num> {t('nutrition.units.kcal')}
                    </>
                  )}
                </p>
              </div>
              {item.recipeId && (
                <button type="button" className={styles.swap} onClick={() => onSwap(index)} aria-label={t('nutrition.plan.swapLabel', { name })}>
                  <Icon name="undo" />
                  {t('nutrition.plan.swap')}
                </button>
              )}
              <IconButton icon="close" tone="muted" label={t('nutrition.plan.removeItem', { name })} onClick={() => onRemoveItem(index)} />
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.addItem} onClick={onAdd}>
        <Icon name="plus" />
        {t('nutrition.plan.addItem')}
      </button>
    </section>
  );
}
