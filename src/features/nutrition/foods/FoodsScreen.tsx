import { useState, type FormEvent } from 'react';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { searchItems } from '@/data';
import { ingredientEntrySchema, type IngredientEntry } from '@/domain/meals';
import { t } from '@/i18n';
import { IconButton, ListRow, ListSection, PageHeader, SearchField, Sheet, SwipeRow, TextField } from '@/ui';
import { fieldText, parseDecimal } from '../shared/numbers';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** More → التغذية → جدول الأكل: the trainer's food table (per 100 g), used by recipes. */
export function FoodsScreen() {
  const ready = useStarterData();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const [version, setVersion] = useState(0);
  const foods = useLive(() => store.getIngredients(), [store, version, ready]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<IngredientEntry | 'new' | null>(null);
  const list = searchItems([...(foods ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ar')), query, (f) => [f.name]);

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
      <ListSection title={t('nutrition.foods.count', { n: list.length })}>
        {list.map((f) => (
          <SwipeRow key={f.id} onDelete={() => void remove(f)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('nutrition.foods.deleteLabel', { name: f.name })}>
            <ListRow
              title={f.name}
              subtitle={t('nutrition.foods.per100', { kcal: fmt(f.per100g.kcal), p: fmt(f.per100g.proteinG), c: fmt(f.per100g.carbG), f: fmt(f.per100g.fatG) })}
              onClick={() => setEditing(f)}
            />
          </SwipeRow>
        ))}
      </ListSection>
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

function FoodSheet({ food, onClose, onSave }: { food: IngredientEntry | null; onClose: () => void; onSave: (f: IngredientEntry) => void }) {
  const [name, setName] = useState(food?.name ?? '');
  const [v, setV] = useState({
    kcal: fieldText(food?.per100g.kcal),
    proteinG: fieldText(food?.per100g.proteinG),
    carbG: fieldText(food?.per100g.carbG),
    fatG: fieldText(food?.per100g.fatG),
  });
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const entry = {
      id: food?.id ?? `custom_${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      per100g: { kcal: parseDecimal(v.kcal), proteinG: parseDecimal(v.proteinG), carbG: parseDecimal(v.carbG), fatG: parseDecimal(v.fatG) },
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
        </div>
      </form>
    </Sheet>
  );
}
