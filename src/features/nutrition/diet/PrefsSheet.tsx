import { useMemo, useState } from 'react';
import { ALLERGENS, type FoodPrefs, type IngredientEntry } from '@/domain/meals';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Icon, SearchField, Sheet, TitleIcon } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import common from '../shared/common.module.css';
import styles from './Cal.module.css';
import diet from './Diet.module.css';

interface Props {
  prefs: FoodPrefs;
  foods: readonly IngredientEntry[];
  onChange: (prefs: FoodPrefs) => void;
  onClose: () => void;
}

type ListKey = 'dislikes' | 'loves';

/** Allergies, budget mode, foods the client dislikes and foods he loves. Changes apply to the plan right away. */
export function PrefsSheet({ prefs, foods, onChange, onClose }: Props) {
  const [picking, setPicking] = useState<ListKey | null>(null);
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const toggleAllergy = (a: (typeof ALLERGENS)[number]) =>
    onChange({ ...prefs, allergies: prefs.allergies.includes(a) ? prefs.allergies.filter((x) => x !== a) : [...prefs.allergies, a] });
  const remove = (key: ListKey, id: string) => onChange({ ...prefs, [key]: prefs[key].filter((x) => x !== id) });
  const add = (key: ListKey, id: string) => {
    const other: ListKey = key === 'loves' ? 'dislikes' : 'loves';
    onChange({ ...prefs, [key]: prefs[key].includes(id) ? prefs[key] : [...prefs[key], id], [other]: prefs[other].filter((x) => x !== id) });
  };

  if (picking) {
    return <FoodPicker foods={foods} title={t(picking === 'loves' ? 'nutrition.cal.lovesTitle' : 'nutrition.cal.dislikesTitle')} onPick={(id) => (add(picking, id), setPicking(null))} onClose={() => setPicking(null)} />;
  }
  return (
    <Sheet open onClose={onClose} title={t('nutrition.cal.prefsTitle')} cancelLabel={t('common.close')}>
      <div className={styles.panel}>
        <h3 className={common.sectionTitle}><TitleIcon name="warning" />{t('nutrition.cal.allergyTitle')}</h3>
        <div className={styles.chips}>
          {ALLERGENS.map((a) => (
            <button key={a} type="button" className={styles.chip} aria-pressed={prefs.allergies.includes(a)} onClick={() => toggleAllergy(a)}>
              {t(`nutrition.cal.allergy.${a}`)}
            </button>
          ))}
        </div>
        <p className={styles.rowSub}>{t('nutrition.cal.porkNote')}</p>
        <label className={diet.check}>
          <input type="checkbox" checked={prefs.budget} onChange={(e) => onChange({ ...prefs, budget: e.target.checked })} />
          {t('nutrition.cal.budget')}
        </label>
        <p className={styles.rowSub}>{t('nutrition.cal.budgetHint')}</p>
        {(['dislikes', 'loves'] as const).map((key) => (
          <div key={key} className={styles.panel}>
            <h3 className={common.sectionTitle}><TitleIcon name="favorite" />{t(key === 'loves' ? 'nutrition.cal.lovesTitle' : 'nutrition.cal.dislikesTitle')}</h3>
            <div className={styles.chips}>
              {prefs[key].map((id) => {
                const f = byId.get(id);
                const name = f ? pick(f.name, f.nameEn) : id;
                return (
                  <button key={id} type="button" className={styles.removable} aria-label={t('nutrition.cal.remove', { name })} onClick={() => remove(key, id)}>
                    {name}
                    <Icon name="close" />
                  </button>
                );
              })}
              <button type="button" className={styles.chip} onClick={() => setPicking(key)}>
                + {t('nutrition.cal.addFood')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function FoodPicker({ foods, title, onPick, onClose }: { foods: readonly IngredientEntry[]; title: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = s ? foods.filter((f) => f.name.toLowerCase().includes(s) || (f.nameEn ?? '').toLowerCase().includes(s)) : foods;
    return all.slice(0, 60);
  }, [foods, q]);
  return (
    <Sheet open onClose={onClose} title={title} cancelLabel={t('common.cancel')}>
      <SearchField value={q} onChange={setQ} placeholder={t('nutrition.cal.searchFood')} label={t('nutrition.cal.searchFood')} clearLabel={t('common.clearSearch')} />
      {list.length === 0 ? (
        <p className={common.muted}>{t('nutrition.cal.noFoods')}</p>
      ) : (
        <ul className={styles.foodList}>
          {list.map((f) => (
            <li key={f.id}>
              <button type="button" className={styles.foodPick} onClick={() => onPick(f.id)}>
                <FoodImage imageId={f.imageId} food={f} className={diet.lineImg} />
                {pick(f.name, f.nameEn)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
