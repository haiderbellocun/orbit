import { useCallback, useEffect, useState } from 'react';
import { getPlantaActiva } from '@/src/lib/api';
import { overlayOrgParents, parseOrgChartGraph } from '@/src/lib/organizationTree';
import { mapPlantaFromApi } from '@/src/lib/plantaMappers';
import type { OrgChartGraphPayload, PlantaPerson } from '@/src/types';

/** La jerarquía necesita la planta completa, no una página. */
const HIERARCHY_PAGE_SIZE = 5000;

/** Tope defensivo: 20 páginas cubren ~100k personas. */
const MAX_PAGES = 20;

export type PlantaPeopleState = {
  rows: PlantaPerson[];
  orgGraph: OrgChartGraphPayload | null;
  total: number;
  loading: boolean;
  loadError: string | null;
  /** `silent` refresca sin mostrar el esqueleto de carga. */
  reload: (opts?: { silent?: boolean }) => Promise<void>;
};

/**
 * Carga la planta completa paginando hasta agotar el total, y le superpone el
 * organigrama (que solo viene en la primera página del listado activo).
 */
export function usePlantaPeople(
  listStatus: 'active' | 'inactive',
  resolveCanEdit: (row: PlantaPerson) => boolean
): PlantaPeopleState {
  const [rows, setRows] = useState<PlantaPerson[]>([]);
  const [orgGraph, setOrgGraph] = useState<OrgChartGraphPayload | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setLoadError(null);
      try {
        const collected: PlantaPerson[] = [];
        let graph: OrgChartGraphPayload | null = null;
        let totalCount = 0;

        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const includeOrg = listStatus === 'active' && page === 1;
          const res = await getPlantaActiva({
            status: listStatus,
            page,
            limit: HIERARCHY_PAGE_SIZE,
            include_org: includeOrg,
          });
          if (includeOrg) graph = parseOrgChartGraph(res.org);

          const list = Array.isArray(res.data)
            ? res.data.map((r) => {
                const mapped = mapPlantaFromApi(r as Record<string, unknown>);
                return { ...mapped, can_edit: resolveCanEdit(mapped) };
              })
            : [];
          collected.push(...list);
          totalCount = res.pagination?.total ?? collected.length;

          if (collected.length >= totalCount || list.length === 0) break;
        }

        setOrgGraph(graph);
        setRows(overlayOrgParents(collected, graph));
        setTotal(totalCount);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : 'No se pudo cargar la planta activa'
        );
        setRows([]);
        setOrgGraph(null);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [listStatus, resolveCanEdit]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, orgGraph, total, loading, loadError, reload };
}
