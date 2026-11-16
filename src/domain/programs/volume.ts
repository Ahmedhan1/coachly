import { muscleLoad, type CatalogExercise, type MuscleGroupId, type MuscleLoad } from '../exercises';
import type { ProgramDay } from '../models';
import type { ProgramBody } from './types';

/** Target-muscle load of one day (drives the day tile chips and the 2D map). */
export function dayMuscleLoad(day: ProgramDay, catalog: ReadonlyMap<string, CatalogExercise>): MuscleLoad[] {
  return muscleLoad(
    day.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets })),
    catalog,
  );
}

/** Target-muscle load of the whole program (one "week" = all its days). */
export function weekMuscleLoad(body: Pick<ProgramBody, 'days'>, catalog: ReadonlyMap<string, CatalogExercise>): MuscleLoad[] {
  return muscleLoad(
    body.days.flatMap((d) => d.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets }))),
    catalog,
  );
}

export interface MuscleSets {
  muscle: MuscleGroupId;
  /** Working sets where the muscle is a primary target. */
  direct: number;
  /** Working sets where it is only a secondary target. */
  indirect: number;
}

/** Weekly sets per muscle (direct / indirect), sorted by direct then indirect sets. Unknown exercises are skipped. */
export function weeklySetsPerMuscle(body: Pick<ProgramBody, 'days'>, catalog: ReadonlyMap<string, CatalogExercise>): MuscleSets[] {
  const map = new Map<MuscleGroupId, MuscleSets>();
  const entry = (muscle: MuscleGroupId) => {
    let e = map.get(muscle);
    if (!e) {
      e = { muscle, direct: 0, indirect: 0 };
      map.set(muscle, e);
    }
    return e;
  };
  for (const day of body.days) {
    for (const item of day.items) {
      const ex = catalog.get(item.exerciseId);
      if (!ex) continue;
      for (const m of ex.primaryMuscles) entry(m).direct += item.sets;
      for (const m of ex.secondaryMuscles) if (!ex.primaryMuscles.includes(m)) entry(m).indirect += item.sets;
    }
  }
  return [...map.values()].sort((a, b) => b.direct - a.direct || b.indirect - a.indirect);
}

/** Primary-target muscles of a day, strongest first (for the title chips). */
export function dayPrimaryMuscles(day: ProgramDay, catalog: ReadonlyMap<string, CatalogExercise>, limit = 3): MuscleGroupId[] {
  return dayMuscleLoad(day, catalog)
    .filter((m) => m.role === 'primary')
    .slice(0, limit)
    .map((m) => m.muscle);
}
