import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { WhatsappTemplate } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, IconButton, ListRow, ListSection, PageHeader, SwipeRow } from '@/ui';
import { removeTemplate, saveTemplate, useWhatsappTemplates } from './templatesStore';
import { TemplateEditSheet } from './TemplateEditSheet';
import styles from './Whatsapp.module.css';

type Editing = { mode: 'edit'; template: WhatsappTemplate } | { mode: 'new' } | null;

/** More → رسائل واتساب: the built-in messages and the trainer's own, all editable. */
export function WhatsappTemplatesScreen() {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const templates = useWhatsappTemplates();
  const [editing, setEditing] = useState<Editing>(null);
  const builtins = templates?.filter((x) => x.kind !== 'custom') ?? [];
  const custom = templates?.filter((x) => x.kind === 'custom') ?? [];

  const onDelete = async (template: WhatsappTemplate) => {
    const removed = await removeTemplate(meta, template.id);
    showToast({
      message: t('schedule.wa.deleted', { name: template.title }),
      actionLabel: t('common.undo'),
      onAction: () => {
        if (removed) void saveTemplate(meta, removed);
      },
      duration: 6000,
    });
  };

  return (
    <>
      <PageHeader
        title={t('schedule.wa.title')}
        back={{ to: '/more', label: t('screens.more.title') }}
        actions={<IconButton icon="plus" label={t('schedule.wa.add')} onClick={() => setEditing({ mode: 'new' })} />}
        subtitle={t('schedule.wa.intro')}
      />
      {templates && (
        <>
          <ListSection icon="chat" title={t('schedule.wa.builtins')}>
            {builtins.map((tpl) => (
              <ListRow
                key={tpl.id}
                leading={<Icon name="chat" />}
                title={tpl.title}
                subtitle={tpl.body.replace(/\n/g, ' ')}
                onClick={() => setEditing({ mode: 'edit', template: tpl })}
              />
            ))}
          </ListSection>
          <ListSection icon="edit" title={t('schedule.wa.custom')} count={custom.length || undefined} bare={custom.length === 0}>
            {custom.length === 0 ? (
              <div className={styles.emptyTile}>
                <EmptyState
                  icon="chat"
                  title={t('schedule.wa.add')}
                  body={t('schedule.wa.noCustom')}
                  action={
                    <Button icon="plus" onClick={() => setEditing({ mode: 'new' })}>
                      {t('schedule.wa.add')}
                    </Button>
                  }
                />
              </div>
            ) : (
              custom.map((tpl) => (
                <SwipeRow
                  key={tpl.id}
                  onDelete={() => void onDelete(tpl)}
                  deleteLabel={t('common.delete')}
                  deleteAccessibleLabel={t('schedule.wa.deleteNamed', { name: tpl.title })}
                >
                  <ListRow
                    leading={<Icon name="note" />}
                    title={tpl.title}
                    subtitle={tpl.body.replace(/\n/g, ' ')}
                    onClick={() => setEditing({ mode: 'edit', template: tpl })}
                  />
                </SwipeRow>
              ))
            )}
          </ListSection>
        </>
      )}
      {editing && (
        <TemplateEditSheet
          template={editing.mode === 'edit' ? editing.template : null}
          onClose={() => setEditing(null)}
          onDelete={(tpl) => {
            setEditing(null);
            void onDelete(tpl);
          }}
        />
      )}
    </>
  );
}
