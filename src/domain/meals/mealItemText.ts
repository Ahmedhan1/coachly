export interface MealItemTextOptions {
  /** Recipe name for the item (already in the wanted language); '' when unknown. */
  name: string;
  /** Unit words, e.g. { g: 'جم', kcal: 'سعر' }. */
  units: { g: string; kcal: string };
  /** Use the English food and unit names when present. */
  english?: boolean;
}

interface ItemLike {
  recipeId?: string | null;
  text: string;
  servings: number;
  lines?: readonly LineLike[];
}

interface LineLike {
  name: string;
  nameEn?: string;
  grams: number;
  kcal: number;
  units?: number;
  unitLabel?: string;
  unitLabelEn?: string;
}

/**
 * One meal item as plain text for the client page and the assistant. Items from the gram planner list each food
 * with its exact grams, then the item's calories: "فراخ بالرز: صدر فراخ ني 180 جم، رز أبيض مطبوخ 150 جم (411 سعر)".
 * Older items keep "name × servings".
 */
export function mealItemText(item: ItemLike, o: MealItemTextOptions): string {
  const name = o.name || item.text;
  const lines = item.lines ?? [];
  if (lines.length === 0) return `${name}${item.servings !== 1 ? ` × ${item.servings}` : ''}`.trim();
  const sep = o.english ? ', ' : '، ';
  const foods = lines
    .map((l) => {
      const food = (o.english && l.nameEn) || l.name;
      const unit = l.units !== undefined && l.unitLabel ? ` (${l.units} ${(o.english && l.unitLabelEn) || l.unitLabel})` : '';
      return `${food} ${Math.round(l.grams)} ${o.units.g}${unit}`;
    })
    .join(sep);
  const kcal = lines.reduce((n, l) => n + l.kcal, 0);
  return `${name}: ${foods} (${Math.round(kcal)} ${o.units.kcal})`;
}

/** Same item as separate short lines (dish with its calories, then "• food 180 جم"), for lists with a length cap. */
export function mealItemRows(item: ItemLike, o: MealItemTextOptions): string[] {
  const lines = item.lines ?? [];
  if (lines.length === 0) return [mealItemText(item, o)];
  const kcal = Math.round(lines.reduce((n, l) => n + l.kcal, 0));
  return [
    `${o.name || item.text} (${kcal} ${o.units.kcal})`,
    ...lines.map((l) => {
      const unit = l.units !== undefined && l.unitLabel ? ` (${l.units} ${(o.english && l.unitLabelEn) || l.unitLabel})` : '';
      return `• ${(o.english && l.nameEn) || l.name} ${Math.round(l.grams)} ${o.units.g}${unit}`;
    }),
  ];
}
