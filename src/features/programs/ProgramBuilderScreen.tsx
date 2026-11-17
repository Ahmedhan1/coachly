import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRepos, useServices } from '@/app/services';
import { useGo } from '@/app/nav';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import type { ExerciseId, ProgramItem } from '@/domain/models';
import {
  addDay,
  addItem,
  copyProgramToClient,
  copyWeek,
  duplicateDay,
  linkSuperset,
  moveItem,
  removeDay,
  removeItem,
  renameDay,
  reorderItems,
  restoreDay,
  restoreItem,
  saveAsTemplate,
  unlinkFromSuperset,
  updateItem,
  type ProgramBody,
  type ProgramEditError,
} from '@/domain/programs';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, IconButton, PageHeader, Tx } from '@/ui';
import { ActionSheet, type SheetAction } from './ActionSheet';
import { markActiveProgram } from './activePrograms';
import { DayPills, DayTile, WeekSummary } from './BuilderParts';
import { useExerciseCatalog } from './catalog';
import { ClientPickerSheet } from './ClientPickerSheet';
import { DayList } from './DayList';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { Glyph } from './glyphs';
import { newLocalId } from './ids';
import { exerciseName } from './names';
import { NameSheet } from './NameSheet';
import { SetEditorSheet } from './SetEditorSheet';
import { useProgramEditor } from './useProgramEditor';
import { usePushedScreen } from './usePushedScreen';
import styles from './Builder.module.css';

type SheetName = null | 'add' | 'swap' | 'menu' | 'copy' | 'assign' | 'copyToClient' | 'assignMany' | 'rename' | 'renameDay';

const ERROR_KEY: Record<ProgramEditError, 'training.programs.menu.tooManyDays' | 'training.programs.menu.tooManyItems' | 'training.programs.builder.notFoundTitle'> = {
  too_many_days: 'training.programs.menu.tooManyDays',
  too_many_items: 'training.programs.menu.tooManyItems',
  not_found: 'training.programs.builder.notFoundTitle',
};

export function ProgramBuilderScreen() {
  usePushedScreen();
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const repos = useRepos();
  const { meta } = useServices();
  const go = useGo();
  const showToast = useUiStore((s) => s.showToast);
  const catalog = useExerciseCatalog();
  const { body, status, apply } = useProgramEditor(programId);
  const client = useLive(async () => (body?.clientId ? ((await repos.clients.get(body.clientId)) ?? null) : null), [repos, body?.clientId]);

  const [sheet, setSheet] = useState<SheetName>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<{ dayId: string | null; ids: ReadonlySet<string> }>({ dayId: null, ids: new Set() });

  const back = { to: params.get('from') === 'client' && body?.clientId ? `/clients/${body.clientId}` : '/more/programs', label: t('training.programs.backToPrograms') };

  if (body === undefined) return <PageHeader title="" back={back} />;
  if (body === null) {
    return (
      <>
        <PageHeader title="" back={back} />
        <EmptyState icon="list" title={t('training.programs.builder.notFoundTitle')} body={t('training.programs.builder.notFoundBody')} />
      </>
    );
  }

  const dayParam = params.get('day');
  const day = body.days.find((d) => d.id === dayParam) ?? body.days[0] ?? null;
  const dayIndex = day ? body.days.indexOf(day) : -1;
  const editing = day?.items.find((it) => it.id === editingId) ?? null;
  const editingIndex = editing && day ? day.items.indexOf(editing) : -1;
  const byId = catalog?.byId ?? new Map();
  const selected: ReadonlySet<string> = selection.dayId === (day?.id ?? null) ? selection.ids : new Set();
  const setSelected = (ids: ReadonlySet<string>) => setSelection({ dayId: day?.id ?? null, ids });

  const selectDay = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('day', id);
    setParams(next, { replace: true });
  };
  const fail = (error: ProgramEditError) => showToast({ message: t(ERROR_KEY[error]) });
  const closeSheet = () => setSheet(null);

  const onAddDay = () => {
    const result = addDay(body, t('training.programs.builder.dayDefault', { n: body.days.length + 1 }), newLocalId);
    if (!result.ok) return fail(result.error);
    apply(() => result.value.body);
    selectDay(result.value.dayId);
  };

  const onPick = (exerciseId: string) => {
    if (!day) return;
    if (sheet === 'swap' && editing) {
      apply((b) => updateItem(b, day.id, editing.id, { exerciseId: exerciseId as ExerciseId }));
      setSheet(null);
      return;
    }
    const result = addItem(body, day.id, exerciseId as ExerciseId, newLocalId);
    if (!result.ok) return fail(result.error);
    apply(() => result.value.body);
    setSheet(null);
    showToast({ message: t('training.programs.picker.added', { name: exerciseName(byId.get(exerciseId), exerciseId) }), duration: 2500 });
  };

  const onRemoveItem = (item: ProgramItem) => {
    if (!day) return;
    const result = removeItem(body, day.id, item.id);
    if (!result.removed) return;
    const removed = result.removed;
    apply(() => result.body);
    setEditingId(null);
    showToast({
      message: t('training.programs.builder.removed', { name: exerciseName(byId.get(item.exerciseId), item.exerciseId) }),
      actionLabel: t('common.undo'),
      onAction: () => apply((b) => restoreItem(b, day.id, removed, result.index)),
    });
  };

  const onToggleSuperset = (item: ProgramItem) => {
    if (!day) return;
    if (item.supersetGroup !== null) {
      apply((b) => ({ ...b, days: b.days.map((d) => (d.id === day.id ? { ...d, items: unlinkFromSuperset(d.items, item.id) } : d)) }));
      showToast({ message: t('training.programs.builder.unlinked'), duration: 2500 });
      return;
    }
    const next = day.items[editingIndex + 1];
    if (!next) return;
    apply((b) => ({ ...b, days: b.days.map((d) => (d.id === day.id ? { ...d, items: linkSuperset(d.items, [item.id, next.id]) } : d)) }));
    showToast({ message: t('training.programs.builder.linked'), duration: 2500 });
  };

  const onLinkSelected = () => {
    if (!day || selected.size < 2) return;
    apply((b) => ({ ...b, days: b.days.map((d) => (d.id === day.id ? { ...d, items: linkSuperset(d.items, [...selected]) } : d)) }));
    setSelecting(false);
    setSelected(new Set());
    showToast({ message: t('training.programs.builder.linked'), duration: 2500 });
  };

  const createCopy = async (copy: ProgramBody, message: string) => {
    const created = await repos.programs.create(copy);
    if (copy.clientId) await markActiveProgram(meta, copy.clientId, created.id);
    showToast({ message, actionLabel: t('training.programs.menu.openCopy'), onAction: () => navigate(`/programs/${created.id}`) });
  };

  const menuActions: SheetAction[] = [
    { key: 'rename', label: t('training.programs.menu.rename'), icon: <Icon name="edit" />, onSelect: () => setSheet('rename') },
    {
      key: 'assign',
      label: body.clientId ? t('training.programs.menu.reassign') : t('training.programs.menu.assign'),
      icon: <Icon name="user" />,
      onSelect: () => setSheet('assign'),
    },
    { key: 'copyToClient', label: t('training.programs.menu.copyToClient'), icon: <Icon name="users" />, onSelect: () => setSheet('copyToClient') },
    { key: 'assignMany', label: t('hub.assignMany.menu'), icon: <Icon name="users" />, onSelect: () => setSheet('assignMany') },
    {
      key: 'template',
      label: t('training.programs.menu.saveTemplate'),
      icon: <Icon name="addSquare" />,
      onSelect: () => {
        setSheet(null);
        void createCopy(saveAsTemplate(body, newLocalId), t('training.programs.menu.templateSaved'));
      },
    },
    ...(day
      ? [
          { key: 'renameDay', label: t('training.programs.menu.renameDay'), icon: <Icon name="edit" />, onSelect: () => setSheet('renameDay') },
          ...(body.clientId
            ? [
                {
                  key: 'start',
                  label: t('training.programs.menu.startSession'),
                  icon: <Icon name="timer" />,
                  onSelect: () => navigate(`/session/new?client=${body.clientId}&program=${programId}&day=${day.id}`),
                },
              ]
            : []),
          {
            key: 'deleteDay',
            label: t('training.programs.menu.deleteDay'),
            icon: <Icon name="trash" />,
            danger: true,
            onSelect: () => {
              const result = removeDay(body, day.id);
              const removed = result.removed;
              if (!removed) return;
              apply(() => result.body);
              setSheet(null);
              showToast({
                message: t('training.programs.menu.dayDeleted', { name: removed.name }),
                actionLabel: t('common.undo'),
                onAction: () => apply((b) => restoreDay(b, removed, result.index)),
              });
            },
          },
        ]
      : []),
    {
      key: 'delete',
      label: t('training.programs.menu.deleteProgram'),
      icon: <Icon name="trash" />,
      danger: true,
      onSelect: async () => {
        await repos.programs.softDelete(programId);
        navigate('/more/programs', { replace: true });
        showToast({
          message: t('training.programs.deleted'),
          actionLabel: t('common.undo'),
          onAction: () => void repos.programs.restore(programId).then(() => navigate(`/programs/${programId}`)),
        });
      },
    },
  ];

  const copyActions: SheetAction[] = [
    ...(day
      ? [
          {
            key: 'dupDay',
            label: t('training.programs.menu.duplicateDay'),
            icon: <Icon name="copy" />,
            onSelect: () => {
              const result = duplicateDay(body, day.id, newLocalId);
              setSheet(null);
              if (!result.ok) return fail(result.error);
              apply(() => result.value.body);
              selectDay(result.value.dayId);
              showToast({ message: t('training.programs.menu.dayDuplicated'), duration: 2500 });
            },
          },
        ]
      : []),
    {
      key: 'week',
      label: t('training.programs.menu.copyWeek'),
      icon: <Icon name="calendarPlus" />,
      disabled: body.days.length === 0,
      onSelect: () => {
        const result = copyWeek(body, newLocalId, (name) => t('training.programs.menu.weekName', { name, n: 2 }));
        setSheet(null);
        if (!result.ok) return fail(result.error);
        apply(() => result.value);
        showToast({ message: t('training.programs.menu.weekCopied'), duration: 2500 });
      },
    },
    { key: 'copyToClient', label: t('training.programs.menu.copyToClient'), icon: <Icon name="users" />, onSelect: () => setSheet('copyToClient') },
    { key: 'assignMany', label: t('hub.assignMany.menu'), icon: <Icon name="users" />, onSelect: () => setSheet('assignMany') },
    {
      key: 'template',
      label: t('training.programs.menu.saveTemplate'),
      icon: <Icon name="addSquare" />,
      onSelect: () => {
        setSheet(null);
        void createCopy(saveAsTemplate(body, newLocalId), t('training.programs.menu.templateSaved'));
      },
    },
  ];

  const statusText =
    status === 'saving' ? t('training.programs.builder.saving') : status === 'error' ? t('training.programs.builder.saveError') : t('training.programs.builder.saved');

  return (
    <div className={styles.screen}>
      <PageHeader
        title={body.name}
        back={back}
        actions={<IconButton icon="more" label={t('training.programs.builder.options')} onClick={() => setSheet('menu')} />}
        subtitle={
          <>
            {body.isTemplate ? (
              t('training.programs.builder.template')
            ) : client ? (
              <button type="button" className={styles.clientLink} onClick={() => go(`/clients/${client.id}`)}>
                {client.name}
              </button>
            ) : (
              t('training.programs.builder.noClient')
            )}
            {' · '}
            <Tx k="training.programs.builder.daysPerWeek" params={{ n: body.days.length }} />
            {' · '}
            <span className={status === 'error' ? styles.statusError : styles.statusOk} role="status" data-testid="save-status">
              {statusText}
            </span>
          </>
        }
      />

      <DayPills days={body.days} selectedId={day?.id ?? null} onSelect={selectDay} onAdd={onAddDay} />

      {catalog === null && <p className={styles.notice}>{t('training.programs.builder.catalogError')}</p>}

      {!day ? (
        <EmptyState
          icon="list"
          title={t('training.programs.builder.noDaysTitle')}
          body={t('training.programs.builder.noDaysBody')}
          action={
            <Button icon="plus" onClick={onAddDay}>
              {t('training.programs.builder.addDay')}
            </Button>
          }
        />
      ) : (
        <>
          <DayTile day={day} index={dayIndex} catalog={byId} />
          {selecting && <p className={styles.selectHint}>{t('training.programs.builder.selectHint')}</p>}
          {day.items.length === 0 ? (
            <div className={styles.emptyDay}>
              <h2>{t('training.programs.builder.emptyDayTitle')}</h2>
              <p>{t('training.programs.builder.emptyDayBody')}</p>
            </div>
          ) : (
            <DayList
              day={day}
              catalog={byId}
              onEdit={(item) => setEditingId(item.id)}
              onReorder={(activeId, overId) => apply((b) => reorderItems(b, day.id, activeId, overId))}
              selecting={selecting}
              selected={selected}
              onToggleSelect={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelected(next);
              }}
            />
          )}
          <WeekSummary body={body} catalog={byId} />
        </>
      )}

      <nav className={styles.actionbar} aria-label={t('training.programs.builder.options')}>
        {selecting ? (
          <>
            <button
              type="button"
              className={styles.stack}
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
              }}
            >
              <Icon name="close" />
              {t('common.cancel')}
            </button>
            <Button size="large" className={styles.primary} disabled={selected.size < 2} onClick={onLinkSelected}>
              {t('training.programs.builder.link', { n: selected.size })}
            </Button>
          </>
        ) : (
          <>
            <button type="button" className={styles.stack} disabled={!day || day.items.length < 2} onClick={() => setSelecting(true)}>
              <Glyph name="link" />
              {t('training.programs.builder.superset')}
            </button>
            <button type="button" className={styles.stack} onClick={() => setSheet('copy')}>
              <Icon name="copy" />
              {t('training.programs.builder.copy')}
            </button>
            <Button size="large" icon="plus" className={styles.primary} disabled={!day || !catalog} onClick={() => setSheet('add')}>
              {t('training.programs.builder.addExercise')}
            </Button>
          </>
        )}
      </nav>

      {catalog && (
        <ExercisePickerSheet
          key={sheet === 'swap' ? `swap-${editing?.id}` : 'add'}
          open={sheet === 'add' || sheet === 'swap'}
          onClose={closeSheet}
          onPick={(e) => onPick(e.id)}
          exercises={catalog.list}
          favourites={catalog.favourites}
          title={sheet === 'swap' ? t('training.programs.picker.swapTitle') : t('training.programs.picker.title')}
          initialMuscle={sheet === 'swap' && editing ? (byId.get(editing.exerciseId)?.primaryMuscles[0] ?? null) : null}
        />
      )}

      <SetEditorSheet
        item={sheet === 'swap' ? null : editing}
        name={editing ? exerciseName(byId.get(editing.exerciseId), editing.exerciseId) : ''}
        onClose={() => setEditingId(null)}
        onChange={(patch) => editing && day && apply((b) => updateItem(b, day.id, editing.id, patch))}
        onMove={(delta) => editing && day && apply((b) => moveItem(b, day.id, editing.id, delta))}
        canMoveUp={editingIndex > 0}
        canMoveDown={day !== null && editingIndex >= 0 && editingIndex < day.items.length - 1}
        onToggleSuperset={() => editing && onToggleSuperset(editing)}
        canLinkNext={day !== null && editingIndex >= 0 && editingIndex < day.items.length - 1}
        onSwap={() => setSheet('swap')}
        onRemove={() => editing && onRemoveItem(editing)}
      />

      <ActionSheet open={sheet === 'menu'} title={t('training.programs.builder.options')} onClose={closeSheet} actions={menuActions} />
      <ActionSheet open={sheet === 'copy'} title={t('training.programs.menu.copyTitle')} onClose={closeSheet} actions={copyActions} />

      <ClientPickerSheet
        open={sheet === 'assign'}
        title={t('training.programs.menu.assign')}
        currentId={body.clientId}
        onClose={closeSheet}
        onPick={(c) => {
          apply((b) => ({ ...b, clientId: c.id, isTemplate: false }));
          void markActiveProgram(meta, c.id, programId);
          setSheet(null);
          showToast({ message: t('training.programs.menu.assigned', { name: c.name }), duration: 2500 });
        }}
      />
      <ClientPickerSheet
        open={sheet === 'copyToClient'}
        title={t('training.programs.menu.copyToClient')}
        excludeId={body.clientId}
        onClose={closeSheet}
        onPick={(c) => {
          setSheet(null);
          void createCopy(copyProgramToClient(body, c.id, newLocalId), t('training.programs.menu.copiedTo', { name: c.name }));
        }}
      />
      <ClientPickerSheet
        open={sheet === 'assignMany'}
        title={t('hub.assignMany.title')}
        onClose={closeSheet}
        onPick={() => undefined}
        onPickMany={(list) => {
          setSheet(null);
          void (async () => {
            for (const c of list) {
              const created = await repos.programs.create(copyProgramToClient(body, c.id, newLocalId, t('training.programs.forClient', { name: c.name })));
              await markActiveProgram(meta, c.id, created.id);
            }
            showToast({ message: t('hub.assignMany.done', { n: list.length }), duration: 3000 });
          })();
        }}
      />
      <NameSheet
        open={sheet === 'rename'}
        title={t('training.programs.menu.rename')}
        label={t('training.programs.menu.nameLabel')}
        initial={body.name}
        required
        onClose={closeSheet}
        onSave={(name) => {
          apply((b) => ({ ...b, name }));
          setSheet(null);
        }}
      />
      <NameSheet
        open={sheet === 'renameDay'}
        title={t('training.programs.menu.renameDay')}
        label={t('training.programs.menu.dayNameLabel')}
        initial={day?.name ?? ''}
        onClose={closeSheet}
        onSave={(name) => {
          if (day) apply((b) => renameDay(b, day.id, name));
          setSheet(null);
        }}
      />
    </div>
  );
}
