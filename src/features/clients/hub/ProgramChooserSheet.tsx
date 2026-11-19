import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client, Program } from '@/domain/models';
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '@/domain/programs';
import { t } from '@/i18n';
import { Icon, ListRow, ListSection, Sheet, Tx } from '@/ui';
import { templateName } from '@/features/programs/names';
import styles from './Hub.module.css';

export type ProgramChoice = { kind: 'builtin'; template: BuiltinTemplate } | { kind: 'copy'; program: Program } | { kind: 'adopt'; program: Program } | { kind: 'activate'; program: Program };

const exercisesIn = (days: ReadonlyArray<{ items: readonly unknown[] }>) => days.reduce((n, d) => n + d.items.length, 0);

/** «اختار برنامج»: built-in templates, the trainer's templates, unassigned programs, this client's older programs. */
export function ProgramChooserSheet({ client, activeId, onClose, onPick }: { client: Client; activeId: string | null; onClose: () => void; onPick: (choice: ProgramChoice) => void }) {
  const repos = useRepos();
  const programs = useLive(() => repos.programs.list(), [repos]) ?? [];
  const mine = programs.filter((p) => p.isTemplate);
  const loose = programs.filter((p) => !p.isTemplate && p.clientId === null);
  const own = programs.filter((p) => !p.isTemplate && p.clientId === client.id && p.id !== activeId);
  const sub = (days: ReadonlyArray<{ items: readonly unknown[] }>) => (
    <>
      {days.length === 1 ? t('training.programs.oneDay') : t('training.programs.days', { n: days.length })} · <Tx k="training.programs.exercisesCount" params={{ n: exercisesIn(days) }} />
    </>
  );
  const row = (p: Program, choice: ProgramChoice) => <ListRow key={p.id} leading={<Icon name="list" />} title={p.name} subtitle={sub(p.days)} onClick={() => onPick(choice)} />;
  return (
    <Sheet open onClose={onClose} title={t('hub.training.chooseTitle', { name: client.name })} cancelLabel={t('common.cancel')}>
      <div className={styles.chooser}>
        <ListSection icon="list" title={t('hub.training.builtin')}>
          {BUILTIN_TEMPLATES.map((tpl) => (
            <ListRow key={tpl.id} leading={<Icon name="list" />} title={templateName(tpl.id)} subtitle={sub(tpl.days)} onClick={() => onPick({ kind: 'builtin', template: tpl })} />
          ))}
        </ListSection>
        {own.length > 0 && <ListSection icon="history" title={t('hub.training.pastOwn')}>{own.map((p) => row(p, { kind: 'activate', program: p }))}</ListSection>}
        {mine.length > 0 && <ListSection icon="star" title={t('hub.training.mine')}>{mine.map((p) => row(p, { kind: 'copy', program: p }))}</ListSection>}
        {loose.length > 0 && <ListSection icon="dumbbell" title={t('hub.training.loose')}>{loose.map((p) => row(p, { kind: 'adopt', program: p }))}</ListSection>}
      </div>
    </Sheet>
  );
}
