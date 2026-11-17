import { useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { sortTasks } from '@/domain/ai';
import { t } from '@/i18n';
import { Button, IconButton, Sheet, TextField } from '@/ui';
import { readTasks, tasksRepo } from './aiSettings';
import styles from './Assistant.module.css';

/** The trainer's to-do list (tasks the assistant proposed and the trainer confirmed, or typed here). */
export function TasksSheet({ onClose, today }: { onClose: () => void; today: string }) {
  const { meta } = useServices();
  const [version, setVersion] = useState(0);
  const tasks = useLive(() => readTasks(meta), [meta, version]);
  const [title, setTitle] = useState('');
  const repo = tasksRepo(meta);
  const change = async (fn: () => Promise<void>) => {
    await fn();
    setVersion((v) => v + 1);
  };
  return (
    <Sheet open onClose={onClose} title={t('assistant.tasks.title')} cancelLabel={t('common.close')}>
      <div className={styles.sheetBody}>
        <form
          className={styles.actions}
          onSubmit={(e) => {
            e.preventDefault();
            const v = title.trim();
            if (!v) return;
            setTitle('');
            void change(() => repo.add({ id: crypto.randomUUID(), title: v.slice(0, 200), due: null, clientId: null, done: false, createdAt: Date.now() }));
          }}
        >
          <TextField label={t('assistant.tasks.add')} placeholder={t('assistant.tasks.addPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" size="small" icon="plus" disabled={!title.trim()}>
            {t('assistant.tasks.addButton')}
          </Button>
        </form>
        {tasks && tasks.length === 0 && <p className={styles.body}>{t('assistant.tasks.empty')}</p>}
        <ul className={styles.taskList}>
          {sortTasks(tasks ?? []).map((task) => (
            <li key={task.id} className={styles.task}>
              <label>
                <input type="checkbox" checked={task.done} aria-label={t('assistant.tasks.doneLabel')} onChange={() => void change(() => repo.toggle(task.id))} />
                <span className={task.done ? styles.taskDone : undefined}>
                  {task.title}
                  {task.due && (
                    <span className={styles.note}>
                      {' · '}
                      {task.due === today ? t('assistant.tasks.today') : task.due < today && !task.done ? t('assistant.tasks.overdue') : `${t('assistant.tasks.due')} ${task.due}`}
                    </span>
                  )}
                </span>
              </label>
              <IconButton icon="trash" tone="muted" label={t('assistant.tasks.delete')} onClick={() => void change(() => repo.remove(task.id))} />
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
