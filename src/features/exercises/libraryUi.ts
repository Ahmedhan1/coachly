import { create } from 'zustand';
import type { EquipmentId, ExerciseLevel, MuscleGroupId } from '@/domain/exercises';

export interface LibraryFilters {
  muscles: MuscleGroupId[];
  equipment: EquipmentId[];
  levels: ExerciseLevel[];
  favouritesOnly: boolean;
  customOnly: boolean;
  showHidden: boolean;
}

export const NO_FILTERS: LibraryFilters = {
  muscles: [],
  equipment: [],
  levels: [],
  favouritesOnly: false,
  customOnly: false,
  showHidden: false,
};

export function activeFilterCount(f: LibraryFilters): number {
  return f.muscles.length + f.equipment.length + f.levels.length + Number(f.favouritesOnly) + Number(f.customOnly) + Number(f.showHidden);
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface LibraryUiState {
  query: string;
  filters: LibraryFilters;
  /** Window scroll of the list, restored when coming back from a detail screen. */
  scrollY: number;
  filtersOpen: boolean;
  addOpen: boolean;
  offlineOpen: boolean;
  setQuery: (query: string) => void;
  setFilters: (filters: LibraryFilters) => void;
  setScrollY: (y: number) => void;
  setSheet: (sheet: 'filters' | 'add' | 'offline', open: boolean) => void;
}

/** Library screen state that survives navigating to a detail screen and back (not persisted). */
export const useLibraryUi = create<LibraryUiState>((set) => ({
  query: '',
  filters: NO_FILTERS,
  scrollY: 0,
  filtersOpen: false,
  addOpen: false,
  offlineOpen: false,
  setQuery: (query) => set({ query }),
  setFilters: (filters) => set({ filters, scrollY: 0 }),
  setScrollY: (scrollY) => set({ scrollY }),
  setSheet: (sheet, open) =>
    set(sheet === 'filters' ? { filtersOpen: open } : sheet === 'add' ? { addOpen: open } : { offlineOpen: open }),
}));
