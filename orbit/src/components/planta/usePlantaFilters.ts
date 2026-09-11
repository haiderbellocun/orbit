import { useEffect, useMemo } from 'react';
import {
  clearPlantaPendingFilters,
  peekPlantaPendingFilters,
} from '@/src/lib/plantaPendingFilters';
import { useFilterState, type FilterState } from '@/src/lib/useFilterState';

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

/** Campos que cuentan como filtro activo en el panel. */
const PLANTA_FILTER_KEYS = [
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

/**
 * Filtros de Planta Activa.
 *
 * Igual que el resto de listados, salvo que otra vista puede dejar filtros
 * pendientes (p. ej. "sin correo CUN" desde el Command Center): se consumen en
 * el primer render, abren el panel y se descartan.
 */
export function usePlantaFilters(
  lockedAreaId: string
): FilterState<PlantaFilters> {
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

  const state = useFilterState(initial, PLANTA_FILTER_KEYS, {
    initiallyOpen: initial.withoutEduEmail || initial.withoutDocument,
  });

  useEffect(() => {
    clearPlantaPendingFilters();
  }, []);

  return state;
}
