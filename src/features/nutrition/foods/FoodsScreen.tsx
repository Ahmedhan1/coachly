import { useState, type FormEvent } from 'react';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { searchItems } from '@/data';
import { FOOD_CATEGORIES, ingredientEntrySchema, shownMacros, type FoodCategory, type IngredientEntry, type Portion } from '@/domain/meals';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Button, IconButton, ListRow, ListSection, Num, PageHeader, SearchField, Select, Sheet, SwipeRow, TextField, Tx } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import { PhotoField } from '../shared/PhotoField';
import { fieldText, parseDecimal } from '../shared/numbers';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';
import styles from './Foods.module.css';

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** More → التغذية → جدول الأكل: the trainer's food table (per 100 g), used by recipes. */
export function FoodsScreen() {
  const ready = useStarterData();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const [version, setVersion] = useState(0);
  const foods = useLive(() => store.getIngredients(), [store, version, ready]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<FoodCategory | 'all'>('all');
  const [editing, setEditing] = useState<IngredientEntry | 'new' | null>(null);
  const inCat = (foods ?? []).filter((f) => cat === 'all' || f.category === cat);
  const [calc, setCalc] = useState(false);
  const list = searchItems([...inCat].sort((a, b) => a.name.localeCompare(b.name, 'ar')), query, (f) => [f.name, f.nameEn ?? '']);

  const save = async (next: IngredientEntry[]) => {
    await store.saveIngredients(next);
    setVersion((v) => v + 1);
  };
  const remove = async (f: IngredientEntry) => {
    const before = foods ?? [];
    await save(before.filter((x) => x.id !== f.id));
    await store.forgetIngredient(f.id);
    showToast({ message: t('nutrition.foods.deleted', { name: f.name }), actionLabel: t('common.undo'), onAction: () => void save(before) });
  };

  return (
    <>
      <PageHeader
        title={t('nutrition.foods.title')}
        back={{ to: '/more/nutrition', label: t('nutrition.book.back') }}
        subtitle={t('nutrition.foods.note')}
        actions={<IconButton icon="plus" label={t('nutrition.foods.add')} onClick={() => setEditing('new')} />}
      />
      <div className={common.section}>
        <SearchField value={query} onChange={setQuery} label={t('nutrition.foods.search')} placeholder={t('nutrition.foods.search')} clearLabel={t('common.clearSearch')} />
      </div>
      <div className={common.section}>
        <Button variant="secondary" icon="target" onClick={() => setCalc(true)}>
          {t('nutrition.foods.calcOpen')}
        </Button>
      </div>
      <div className={styles.cats} role="group" aria-label={t('nutrition.foods.category')}>
        {(['all', ...FOOD_CATEGORIES] as const).map((c) => (
          <button key={c} type="button" className={styles.cat} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === 'all' ? t('nutrition.foods.all') : t(`nutrition.foodCats.${c}`)}
          </button>
        ))}
      </div>
      <ListSection icon="nutrition" title={t('nutrition.foods.count', { n: list.length })}>
        {list.map((f) => (
          <SwipeRow key={f.id} onDelete={() => void remove(f)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('nutrition.foods.deleteLabel', { name: f.name })}>
            <ListRow
              leading={<FoodImage imageId={f.imageId} food={f} />}
              title={pick(f.name, f.nameEn)}
              subtitle={
                <>
                  <span className={styles.subLine}>
                    <Tx k="nutrition.foods.per100" params={{ kcal: Number(fmt(f.per100g.kcal)), p: Number(fmt(f.per100g.proteinG)), c: Number(fmt(f.per100g.carbG)), f: Number(fmt(f.per100g.fatG)) }} />
                    {f.per100g.fiberG !== undefined && (
                      <>
                        {' · '}
                        <Tx k="nutrition.foods.fiberShort" params={{ n: Number(fmt(f.per100g.fiberG)) }} />
                      </>
                    )}
                  </span>
                  {f.portions && f.portions.length > 0 && (
                    <span className={styles.subLine}>
                      {f.portions.slice(0, 2).map((p, i) => (
                        <span key={p.label}>
                          {i > 0 && ' · '}
                          <Tx k="nutrition.foods.perPortion" params={{ label: pick(p.label, p.labelEn), g: p.grams, kcal: Math.round((f.per100g.kcal * p.grams) / 100) }} />
                        </span>
                      ))}
                    </span>
                  )}
                </>
              }
              onClick={() => setEditing(f)}
            />
          </SwipeRow>
        ))}
      </ListSection>
      {calc && <FoodCalculator foods={foods ?? []} onClose={() => setCalc(false)} />}
      {editing && (
        <FoodSheet
          food={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (food) => {
            const current = foods ?? [];
            await save(current.some((x) => x.id === food.id) ? current.map((x) => (x.id === food.id ? food : x)) : [...current, food]);
            setEditing(null);
            showToast({ message: t('nutrition.foods.saved'), duration: 2000 });
          }}
        />
      )}
    </>
  );
}

/** Quick calculator: a food and an amount in grams (or a household measure) → calories and macros. */
function FoodCalculator({ foods, onClose }: { foods: IngredientEntry[]; onClose: () => void }) {
  const sorted = [...foods].sort((a, b) => pick(a.name, a.nameEn).localeCompare(pick(b.name, b.nameEn), 'ar'));
  const [foodId, setFoodId] = useState(sorted[0]?.id ?? '');
  const [grams, setGrams] = useState('100');
  const food = foods.find((f) => f.id === foodId);
  const g = parseDecimal(grams);
  const valid = food !== undefined && Number.isFinite(g) && g > 0;
  const m = valid ? shownMacros(food.per100g, g) : null;
  return (
    <Sheet open onClose={onClose} title={t('nutrition.foods.calcTitle')} cancelLabel={t('common.close')}>
      <div className={common.form}>
        <Select label={t('nutrition.foods.calcFood')} value={foodId} onChange={setFoodId} options={sorted.map((f) => ({ value: f.id, label: pick(f.name, f.nameEn) }))} />
        <TextField label={t('nutrition.foods.calcGrams')} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} ltr />
        {food?.portions && food.portions.length > 0 && (
          <div className={styles.portions} role="group" aria-label={t('nutrition.foods.calcPortions')}>
            {food.portions.map((p) => (
              <button key={p.label} type="button" className={common.chip} aria-pressed={g === p.grams} onClick={() => setGrams(String(p.grams))}>
                {pick(p.label, p.labelEn)} <Num>{p.grams}</Num>
              </button>
            ))}
          </div>
        )}
        {m && food ? (
          <div className={styles.calcResult} role="status">
            <p className={styles.calcFood}>
              <Tx k="nutrition.foods.calcResult" params={{ g: Number(fmt(g)), name: pick(food.name, food.nameEn) }} />
            </p>
            <p className={styles.calcKcal}>
              <Tx k="nutrition.foods.calcKcal" params={{ kcal: m.kcal }} />
            </p>
            <p className={common.caption}>
              <Tx k="nutrition.foods.calcMacros" params={{ p: m.proteinG, c: m.carbG, f: m.fatG }} />
            </p>
          </div>
        ) : (
          <p className={common.muted}>{t('nutrition.foods.calcEmpty')}</p>
        )}
      </div>
    </Sheet>
  );
}

function FoodSheet({ food, onClose, onSave }: { food: IngredientEntry | null; onClose: () => void; onSave: (f: IngredientEntry) => void }) {
  const [name, setName] = useState(food?.name ?? '');
  const [v, setV] = useState({
    kcal: fieldText(food?.per100g.kcal),
    proteinG: fieldText(food?.per100g.proteinG),
    carbG: fieldText(food?.per100g.carbG),
    fatG: fieldText(food?.per100g.fatG),
    fiberG: fieldText(food?.per100g.fiberG),
  });
  const [category, setCategory] = useState<FoodCategory | ''>(food?.category ?? '');
  const [imageId, setImageId] = useState<string | null>(food?.imageId ?? null);
  const portions: Portion[] = food?.portions ?? [];
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const entry = {
      id: food?.id ?? `custom_${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      per100g: {
        kcal: parseDecimal(v.kcal),
        proteinG: parseDecimal(v.proteinG),
        carbG: parseDecimal(v.carbG),
        fatG: parseDecimal(v.fatG),
        ...(v.fiberG.trim() === '' ? {} : { fiberG: parseDecimal(v.fiberG) }),
      },
      ...(category ? { category } : {}),
      ...(portions.length > 0 ? { portions } : {}),
      ...(food?.icon ? { icon: food.icon } : {}),
      ...(food?.nameEn && name.trim() === food.name ? { nameEn: food.nameEn } : {}),
      ...(food?.unitG !== undefined ? { unitG: food.unitG, ...(food.unitHalf ? { unitHalf: true } : {}) } : {}),
      imageId,
    };
    const parsed = ingredientEntrySchema.safeParse(entry);
    if (!parsed.success) return setError(t('nutrition.foods.invalid'));
    onSave(parsed.data);
  };
  const field = (k: keyof typeof v, label: string) => (
    <TextField label={label} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} ltr />
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={food ? t('nutrition.foods.editTitle') : t('nutrition.foods.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form="food-form" className={common.sheetSave}>
          {t('common.save')}
        </button>
      }
    >
      <form id="food-form" className={common.form} onSubmit={submit} noValidate>
        <TextField label={t('nutrition.foods.name')} value={name} error={error} onChange={(e) => (setName(e.target.value), setError(null))} />
        <div className={common.grid2}>
          {field('kcal', t('nutrition.foods.kcal'))}
          {field('proteinG', t('nutrition.foods.protein'))}
          {field('carbG', t('nutrition.foods.carb'))}
          {field('fatG', t('nutrition.foods.fat'))}
          {field('fiberG', t('nutrition.foods.fiber'))}
        </div>
        <Select
          label={t('nutrition.foods.category')}
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: '—' }, ...FOOD_CATEGORIES.map((c) => ({ value: c, label: t(`nutrition.foodCats.${c}`) }))]}
        />
        {portions.length > 0 && (
          <p className={common.caption}>
            {t('nutrition.foods.portions')}: {portions.map((p) => `${pick(p.label, p.labelEn)} = ${p.grams} ${t('nutrition.units.g')}`).join(' · ')}
          </p>
        )}
        <PhotoField label={t('nutrition.foods.photo')} addLabel={t('nutrition.foods.addPhoto')} removeLabel={t('nutrition.foods.removePhoto')} imageId={imageId} onChange={setImageId} />
        <p className={common.caption}>{t('nutrition.foods.photoNote')}</p>
      </form>
    </Sheet>
  );
}
