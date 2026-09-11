import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearPlantaPendingFilters,
  peekPlantaPendingFilters,
} from '@/src/lib/plantaPendingFilters';

export type PlantaFilters = {
  search: string;
  areaId: string;
  schoolId: string;
  programId: string;
  roleId: string;
  withoutSchool: boolean;
  withoutProgram: boolean;
  withoutRole: boolean;
  withoutEduEmail: boolean;
  withoutDocument: boolean;
};

export const EMPTY_PLANTA_FILTERS: PlantaFilters = {
  search: '',
  areaId: '',
  schoolId: '',
  programId: '',
  roleId: '',
  withoutSchool: false,
  withoutProgram: false,
  withoutRole: false,
  withoutEduEmail: false,
  withoutDocument: false,
};

/** Los filtros de checkbox; `search` se cuenta aparte. */
const TOGGLE_KEYS = [
  'areaId',
  'schoolId',
  'programId',
  'roleId',
  'withoutSchool',
  'withoutProgram',
  'withoutRole',
  'withoutEduEmail',
  'withoutDocument',
] as const satisfies readonly (keyof PlantaFilters)[];

const SEARCH_DEBOUNCE_MS = 300;

export type PlantaFiltersController = {
  /** Lo que el usuario está escribiendo. */
  filters: PlantaFilters;
  setFilters: React.Dispatch<React.SetStateAction<PlantaFilters>>;
  /** Lo que realmente filtra la lista (search llega con debounce). */
  applied: PlantaFilters;
  filtersOpen: boolean;
  setFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  applyFilters: () => void;
  clearFilters: () => void;
  activeFilterCount: number;
  hasActiveQuery: boolean;
};

/**
 * Estado de los filtros de Planta Activa.
 *
 * Otra vista puede dejar filtros pendientes (p. ej. "sin correo CUN" desde el
 * Command Center); se consumen en el primer render y se descartan.
 */
export function usePlantaFilters(lockedAreaId: string): PlantaFiltersController {
  const initial = useMemo<PlantaFilters>(() => {
    const pending = peekPlantaPendingFilters();
    return {
      ...EMPTY_PLANTA_FILTERS,
      areaId: lockedAreaId,
      withoutEduEmail: Boolean(pending?.withoutEduEmail),
      withoutDocument: Boolean(pending?.withoutDocument),
    };
    // Solo el primer render: los filtros pendientes se consumen una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<PlantaFilters>(initial);
  const [applied, setApplied] = useState<PlantaFilters>(initial);
  const [filtersOpen, setFiltersOpen] = useState(
    () => initial.withoutEduEmail || initial.withoutDocument
  );

  useEffect(() => {
    clearPlantaPendingFilters();
  }, []);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.search, applied.search]);

  const applyFilters = useCallback(() => {
    setApplied({ ...filters });
  }, [filters]);

  const clearFilters = useCallback(() => {
    const next: PlantaFilters = {
      ...EMPTY_PLANTA_FILTERS,
      areaId: lockedAreaId,
    };
    setFilters(next);
    setApplied(next);
  }, [lockedAreaId]);

  const activeFilterCount = useMemo(
    () => TOGGLE_KEYS.filter((key) => Boolean(applied[key])).length,
    [applied]
  );

  return {
    filters,
    setFilters,
    applied,
    filtersOpen,
    setFiltersOpen,
    applyFilters,
    clearFilters,
    activeFilterCount,
    hasActiveQuery:
      Boolean(applied.search.trim()) || activeFilterCount > 0,
  };
}
