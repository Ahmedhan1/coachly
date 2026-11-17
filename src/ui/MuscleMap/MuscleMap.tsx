import type { KeyboardEvent } from 'react';
import { muscleGroupLabelAr, type MuscleGroupId } from '@/domain/exercises';
import { t } from '@/i18n';
import { cx } from '../cx';
import { fillStep, muscleFill, type MuscleIntensities, type MuscleMapPalette } from './colors';
import { BASE_PATHS, VIEW_PATHS, VIEWBOX, type BodyView } from './shapes';
import styles from './MuscleMap.module.css';

export interface MuscleMapProps {
  /** 0..1 per muscle group (see intensitiesFromLoad); drives the light → strong brand scale. */
  intensities?: MuscleIntensities;
  view?: BodyView | 'both';
  /** Height of one figure in px (width follows the 100:230 ratio). Default 230. */
  size?: number;
  /** Makes every region a button. Omit for a static picture (thumbnails, PDF). */
  onSelect?: (id: MuscleGroupId) => void;
  selected?: MuscleGroupId | null;
  /** Accessible name of the whole map. */
  label?: string;
  /** Concrete colours instead of the theme's CSS variables (PDF / canvas snapshots). */
  palette?: MuscleMapPalette;
  /** Show the "front / back" caption under each figure. */
  captions?: boolean;
  className?: string;
}

const mirror = `matrix(-1 0 0 1 ${VIEWBOX.width} 0)`;

/** Front/back body map, pure SVG. Every muscle group is one region (both sides). */
export function MuscleMap({
  intensities = {},
  view = 'both',
  size = 230,
  onSelect,
  selected = null,
  label,
  palette,
  captions = false,
  className,
}: MuscleMapProps) {
  const views: BodyView[] = view === 'both' ? ['front', 'back'] : [view];
  const width = Math.round((size * VIEWBOX.width) / VIEWBOX.height);
  return (
    <div
      className={cx(styles.map, className)}
      role={onSelect ? 'group' : 'img'}
      aria-label={label ?? t('training.library.map.label')}
    >
      {views.map((v) => (
        <figure key={v} className={styles.figure}>
          <svg
            width={width}
            height={size}
            viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
            className={styles.svg}
            data-view={v}
            aria-hidden={onSelect ? undefined : true}
            focusable="false"
          >
            <g fill={palette?.base ?? 'var(--muscle-base)'}>
              {BASE_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
              <g transform={mirror}>
                {BASE_PATHS.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            </g>
            {VIEW_PATHS[v].map(([id, paths]) => (
              <Region
                key={id}
                id={id}
                view={v}
                paths={paths}
                fill={muscleFill(intensities[id], palette)}
                step={fillStep(intensities[id])}
                selected={selected === id}
                onSelect={onSelect}
              />
            ))}
          </svg>
          {captions && <figcaption className={styles.caption}>{t(`training.library.map.${v}`)}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

interface RegionProps {
  id: MuscleGroupId;
  view: BodyView;
  paths: readonly string[];
  fill: string;
  step: number;
  selected: boolean;
  onSelect: ((id: MuscleGroupId) => void) | undefined;
}

function Region({ id, view, paths, fill, step, selected, onSelect }: RegionProps) {
  const shapes = paths.map((d) => <path key={d} d={d} />);
  const body = (
    <>
      {shapes}
      <g transform={mirror}>{shapes}</g>
    </>
  );
  const common = {
    'data-muscle': id,
    'data-view': view,
    'data-step': step,
    fill,
    className: cx(styles.region, selected && styles.selected),
  };
  if (!onSelect) return <g {...common}>{body}</g>;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };
  return (
    <g
      {...common}
      role="button"
      tabIndex={0}
      aria-label={muscleGroupLabelAr(id)}
      aria-pressed={selected}
      className={cx(common.className, styles.interactive)}
      onClick={() => onSelect(id)}
      onKeyDown={onKey}
    >
      {body}
    </g>
  );
}
