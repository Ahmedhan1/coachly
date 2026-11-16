import { t, type TKey } from '@/i18n';
import { EmptyState, PageHeader, type IconName } from '@/ui';
import styles from './PlaceholderScreens.module.css';

interface PlaceholderProps {
  title: TKey;
  emptyTitle: TKey;
  emptyBody: TKey;
  icon: IconName;
  /** Screens under "More" get a back link. */
  nested?: boolean;
}

function Placeholder({ title, emptyTitle, emptyBody, icon, nested }: PlaceholderProps) {
  return (
    <>
      <PageHeader title={t(title)} back={nested ? { to: '/more', label: t('screens.more.title') } : undefined} />
      <div className={styles.body}>
        <EmptyState icon={icon} title={t(emptyTitle)} body={t(emptyBody)} />
      </div>
    </>
  );
}

const make = (key: keyof typeof SCREEN_ICONS, nested = true) =>
  function Screen() {
    return (
      <Placeholder
        title={`screens.${key}.title`}
        emptyTitle={`screens.${key}.emptyTitle`}
        emptyBody={`screens.${key}.emptyBody`}
        icon={SCREEN_ICONS[key]}
        nested={nested}
      />
    );
  };

const SCREEN_ICONS = {
  schedule: 'calendar',
  exercises: 'dumbbell',
  muscleMap: 'body',
  programs: 'list',
  nutrition: 'utensils',
  supplements: 'pill',
  progress: 'chart',
  pdf: 'file',
  settings: 'settings',
} as const satisfies Record<string, IconName>;

export const ScheduleScreen = make('schedule', false);
export const ExercisesScreen = make('exercises', false);
export const MuscleMapScreen = make('muscleMap');
export const ProgramsScreen = make('programs');
export const NutritionScreen = make('nutrition');
export const SupplementsScreen = make('supplements');
export const ProgressScreen = make('progress');
export const PdfScreen = make('pdf');
export { SCREEN_ICONS };
