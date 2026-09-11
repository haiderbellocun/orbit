import { useEffect, useState } from 'react';
import {
  getCatalogAreas,
  getCatalogPrograms,
  getCatalogRoles,
  getCatalogSchools,
  type CatalogArea,
  type CatalogProgram,
  type CatalogRole,
  type CatalogSchool,
} from '@/src/lib/api';

type Named = { id: number; name: string };

/**
 * Une los catálogos de varias áreas en una sola lista sin repetidos.
 *
 * Un usuario con alcance a varias áreas necesita una consulta por área; el
 * resultado se deduplica por id y se ordena como lo espera el selector.
 */
async function loadAcrossAreas<T extends Named>(
  areaIds: number[],
  fetchForArea: (areaId: number) => Promise<T[]>
): Promise<T[]> {
  const chunks = await Promise.all(areaIds.map(fetchForArea));
  const byId = new Map<number, T>();
  for (const chunk of chunks) {
    for (const item of Array.isArray(chunk) ? chunk : []) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Áreas y roles: fijos para toda la sesión de la vista. */
export function usePlantaBaseCatalogs(): {
  areas: CatalogArea[];
  roles: CatalogRole[];
} {
  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [roles, setRoles] = useState<CatalogRole[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [a, r] = await Promise.all([getCatalogAreas(), getCatalogRoles()]);
        if (cancelled) return;
        setAreas(asList<CatalogArea>(a));
        setRoles(asList<CatalogRole>(r));
      } catch {
        if (cancelled) return;
        setAreas([]);
        setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { areas, roles };
}

/**
 * Escuelas y programas dependientes del área/escuela elegidas y del alcance
 * del usuario. Cuando la selección deja de existir en la nueva lista,
 * `onPruneSelection` la limpia.
 */
export function usePlantaScopedCatalogs(params: {
  areaId: string;
  schoolId: string;
  /** Áreas visibles para el usuario; `null` = sin límite. */
  catalogAreaIds: number[] | null;
  onPruneSchool: (available: CatalogSchool[]) => void;
  onPruneProgram: (available: CatalogProgram[]) => void;
}): { schools: CatalogSchool[]; programs: CatalogProgram[] } {
  const { areaId, schoolId, catalogAreaIds, onPruneSchool, onPruneProgram } =
    params;
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);

  useEffect(() => {
    let cancelled = false;
    const selectedArea = areaId ? Number(areaId) : undefined;
    void (async () => {
      try {
        let list: CatalogSchool[] = [];
        if (selectedArea != null && Number.isFinite(selectedArea)) {
          // Un área fuera del alcance del usuario no ofrece escuelas.
          list =
            catalogAreaIds != null && !catalogAreaIds.includes(selectedArea)
              ? []
              : asList<CatalogSchool>(
                  await getCatalogSchools({ area_id: selectedArea })
                );
        } else if (catalogAreaIds != null && catalogAreaIds.length > 0) {
          list = await loadAcrossAreas(catalogAreaIds, (id) =>
            getCatalogSchools({ area_id: id })
          );
        } else {
          list = asList<CatalogSchool>(await getCatalogSchools());
        }
        if (cancelled) return;
        setSchools(list);
        onPruneSchool(list);
      } catch {
        if (!cancelled) setSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onPruneSchool es estable (useCallback en el llamador).
  }, [areaId, catalogAreaIds, onPruneSchool]);

  useEffect(() => {
    let cancelled = false;
    const selectedSchool = schoolId ? Number(schoolId) : undefined;
    void (async () => {
      try {
        let list: CatalogProgram[] = [];
        if (selectedSchool != null && Number.isFinite(selectedSchool)) {
          list = asList<CatalogProgram>(
            await getCatalogPrograms({ school_id: selectedSchool })
          );
        } else if (catalogAreaIds != null && catalogAreaIds.length > 0) {
          list = await loadAcrossAreas(catalogAreaIds, (id) =>
            getCatalogPrograms({ area_id: id })
          );
        } else {
          list = asList<CatalogProgram>(await getCatalogPrograms());
        }
        if (cancelled) return;
        setPrograms(list);
        onPruneProgram(list);
      } catch {
        if (!cancelled) setPrograms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, catalogAreaIds, onPruneProgram]);

  return { schools, programs };
}
