import { useCallback, useEffect, useMemo, useState } from 'react';

/** Todo filtro del proyecto lleva una búsqueda libre más campos concretos. */
type WithSearch = { search: string };

const SEARCH_DEBOUNCE_MS = 300;

export type FilterState<T extends WithSearch> = {
  /** Lo que el usuario está editando en el panel. */
  filters: T;
  setFilters: React.Dispatch<React.SetStateAction<T>>;
  /** Lo que realmente consulta la lista; `search` llega con debounce. */
  applied: T;
  filtersOpen: boolean;
  setFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  applyFilters: () => void;
  clearFilters: () => void;
  /** Cuántos filtros (sin contar la búsqueda) están puestos. */
  activeFilterCount: number;
  /** Hay búsqueda o algún filtro: la lista no está en su estado neutro. */
  hasActiveQuery: boolean;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
};

function isSet(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return Boolean(value);
}

/**
 * Filtros escritos vs aplicados, con debounce de búsqueda y paginación.
 *
 * Las vistas de listado repetían este bloque entero: dos copias del estado,
 * un efecto de debounce que además vuelve a la página 1, aplicar/limpiar y un
 * contador de filtros activos escrito campo por campo.
 *
 * `countKeys` son los campos que cuentan como filtro activo; `search` nunca
 * cuenta (se refleja en `hasActiveQuery`).
 */
export function useFilterState<T extends WithSearch>(
  initial: T,
  countKeys: readonly (keyof T)[],
  opts?: { initiallyOpen?: boolean }
): FilterState<T> {
  const [filters, setFilters] = useState<T>(initial);
  const [applied, setApplied] = useState<T>(initial);
  const [filtersOpen, setFiltersOpen] = useState(opts?.initiallyOpen ?? false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = setTimeout(() => {
      setCurrentPage(1);
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.search, applied.search]);

  const applyFilters = useCallback(() => {
    setCurrentPage(1);
    setApplied({ ...filters });
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters(initial);
    setApplied(initial);
    setCurrentPage(1);
  }, [initial]);

  const activeFilterCount = useMemo(
    () => countKeys.filter((key) => isSet(applied[key])).length,
    // countKeys es una constante de módulo en cada vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    hasActiveQuery: Boolean(applied.search.trim()) || activeFilterCount > 0,
    currentPage,
    setCurrentPage,
  };
}
