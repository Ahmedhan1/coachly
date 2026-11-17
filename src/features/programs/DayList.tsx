import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';
import type { CatalogExercise } from '@/domain/exercises';
import type { ProgramDay, ProgramItem } from '@/domain/models';
import { compactTempo, dayBlocks, displayReps } from '@/domain/programs';
import { t } from '@/i18n';
import { Icon, Num, Tx, cx } from '@/ui';
import { ExerciseThumb } from './ExerciseThumb';
import { Glyph } from './glyphs';
import { exerciseName, exerciseSubline } from './names';
import styles from './Builder.module.css';

export interface DayListProps {
  day: ProgramDay;
  catalog: ReadonlyMap<string, CatalogExercise>;
  onEdit: (item: ProgramItem) => void;
  onReorder: (activeId: string, overId: string) => void;
  /** Superset selection mode. */
  selecting: boolean;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
}

/** Exercise cards of one day, grouped into superset tiles, drag-sortable by the grip handle. */
export function DayList({ day, catalog, onEdit, onReorder, selecting, selected, onToggleSelect }: DayListProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Small hold on touch so a swipe over the grip still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const nameOf = (id: string | number | undefined) => {
    const item = day.items.find((it) => it.id === id);
    return item ? exerciseName(catalog.get(item.exerciseId), item.exerciseId) : '';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('training.programs.builder.dnd.pickedUp', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? t('training.programs.builder.dnd.movedOver', { name: nameOf(active.id), over: nameOf(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? t('training.programs.builder.dnd.dropped', { name: nameOf(active.id), over: nameOf(over.id) }) : undefined),
    onDragCancel: () => t('training.programs.builder.dnd.cancelled'),
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.id !== e.over.id) onReorder(String(e.active.id), String(e.over.id));
  };

  const blocks = dayBlocks(day.items);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('training.programs.builder.dnd.instructions') } }}
    >
      <SortableContext items={day.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => {
          if (block.kind === 'single') {
            return (
              <div key={block.item.id} className={styles.tile}>
                <SortableCard
                  item={block.item}
                  exercise={catalog.get(block.item.exerciseId)}
                  onEdit={onEdit}
                  selecting={selecting}
                  selected={selected.has(block.item.id)}
                  onToggleSelect={onToggleSelect}
                  dragging={activeId === block.item.id}
                />
              </div>
            );
          }
          const last = block.items[block.items.length - 1];
          return (
            <div key={`ss-${block.items[0]?.id}`} className={cx(styles.tile, styles.superset)} data-testid="superset">
              <div className={styles.ssHead}>
                <Glyph name="link" />
                <span>{t('training.programs.builder.superset')}</span>
                {last && (
                  <span className={styles.ssRest}>
                    <Tx
                      k={block.items.length === 2 ? 'training.programs.builder.restAfterGroup' : 'training.programs.builder.restAfterAll'}
                      params={{ n: last.restSec }}
                    />
                  </span>
                )}
              </div>
              {block.items.map((item, i) => (
                <SortableCard
                  key={item.id}
                  item={item}
                  tag={block.tags[i]}
                  exercise={catalog.get(item.exerciseId)}
                  onEdit={onEdit}
                  selecting={selecting}
                  selected={selected.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  dragging={activeId === item.id}
                  inSuperset
                />
              ))}
            </div>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}

interface CardProps {
  item: ProgramItem;
  exercise: CatalogExercise | undefined;
  tag?: string;
  onEdit: (item: ProgramItem) => void;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  dragging: boolean;
  inSuperset?: boolean;
}

function SortableCard({ item, exercise, tag, onEdit, selecting, selected, onToggleSelect, dragging, inSuperset }: CardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: item.id, disabled: selecting });
  const name = exerciseName(exercise, item.exerciseId);
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scale(${dragging ? 1.02 : 1})` : undefined,
    transition,
  };
  const showRest = !inSuperset;
  return (
    <article ref={setNodeRef} style={style} className={cx(styles.card, dragging && styles.dragging)} data-testid="exercise-card" data-exercise={item.exerciseId}>
      <button
        type="button"
        className={styles.cardMain}
        onClick={() => (selecting ? onToggleSelect(item.id) : onEdit(item))}
        aria-label={selecting ? t('training.programs.builder.selectLabel', { name }) : t('training.programs.builder.edit', { name })}
        aria-pressed={selecting ? selected : undefined}
      >
        <ExerciseThumb exercise={exercise} tag={tag} />
        <span className={styles.cardText}>
          <span className={styles.cardName}>{name}</span>
          <span className={styles.cardSub}>{exerciseSubline(exercise)}</span>
          <span className={styles.sets}>
            <Num>{item.sets}</Num>
            <small>{t('training.programs.builder.sets')}</small>
            <span className={styles.times} aria-hidden="true">
              ×
            </span>
            <Num>{displayReps(item.reps)}</Num>
            <small>{t('training.programs.builder.reps')}</small>
          </span>
          <span className={styles.meta}>
            {showRest && item.restSec > 0 && (
              <span className={styles.chip}>
                <Tx k="training.programs.builder.restChip" params={{ n: <b className="num">{item.restSec}</b> }} />
              </span>
            )}
            {item.tempo && (
              <span className={styles.chip}>
                <Tx k="training.programs.builder.tempoChip" params={{ n: <b className="num">{compactTempo(item.tempo)}</b> }} />
              </span>
            )}
            {item.rpe !== null && (
              <span className={styles.chip}>
                <Tx k="training.programs.builder.rpeChip" params={{ n: <b className="num">{item.rpe}</b> }} />
              </span>
            )}
          </span>
        </span>
      </button>
      {selecting ? (
        <span className={cx(styles.check, selected && styles.checkOn)} aria-hidden="true">
          {selected && <Icon name="check" />}
        </span>
      ) : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.grip}
          {...attributes}
          {...listeners}
          aria-label={t('training.programs.builder.dragHandle', { name })}
        >
          <Glyph name="grip" />
        </button>
      )}
    </article>
  );
}
