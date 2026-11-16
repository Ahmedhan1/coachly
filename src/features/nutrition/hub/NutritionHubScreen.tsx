import { t } from '@/i18n';
import { Icon, ListRow, ListSection, PageHeader } from '@/ui';
import { ClientChooser } from '../shared/ClientChooser';

/** More → التغذية: the recipe book, then a client list into the calculator and meal plan. */
export function NutritionHubScreen() {
  return (
    <>
      <PageHeader title={t('nutrition.hub.title')} back={{ to: '/more', label: t('screens.more.title') }} />
      <ListSection>
        <ListRow leading={<Icon name="utensils" />} title={t('nutrition.hub.recipesTitle')} subtitle={t('nutrition.hub.recipesHint')} to="/more/recipes" />
      </ListSection>
      <ClientChooser path="nutrition" title={t('nutrition.hub.pickClient')} emptyBody={t('nutrition.hub.noClients')} />
    </>
  );
}
