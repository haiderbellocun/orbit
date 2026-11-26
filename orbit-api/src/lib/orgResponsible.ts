/**
 * Quién tiene responsable en Planta Activa: personas alcanzables desde la raíz
 * del organigrama (con los overrides de Planta aplicados). Replica el recorrido
 * de `orbit/src/lib/organizationTree.ts` (childrenFor) para que "sin
 * responsable" signifique lo mismo en Carga Académica que en Planta Activa.
 */

import { loadOrgChartGraph } from "./orgChartGraph";
import { applyPlantaOrgOverrides, buildChildIndex } from "./orgChartTreeEngine";

export type ResponsibleIndex = {
  /** Personas con responsable (incluye la raíz, que no lo necesita). */
  reachable: Set<number>;
  /** person_id → person_id de su responsable directo. */
  parentOf: Map<number, number>;
  /** person_id → personas a su cargo directo (equipo que ve en Planta). */
  childrenOf: Map<number, Set<number>>;
};

const CACHE_MS = 60_000;
let cache: { at: number; value: ResponsibleIndex | null } | null = null;

export async function loadResponsibleIndex(): Promise<ResponsibleIndex | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await computeResponsibleIndex();
  cache = { at: Date.now(), value };
  return value;
}

/** Tras cambiar un responsable en Planta, el siguiente uso recalcula el índice. */
export function invalidateResponsibleIndex(): void {
  cache = null;
}

async function computeResponsibleIndex(): Promise<ResponsibleIndex | null> {
  const graph = await loadOrgChartGraph();
  if (graph == null || graph.relations.length === 0) return null;

  const effective = applyPlantaOrgOverrides(
    graph.relations,
    graph.positionChildren,
    graph.plantaOverrides
  );
  const index = buildChildIndex(effective);

  const reachable = new Set<number>();
  const parentOf = new Map<number, number>();
  const childrenOf = new Map<number, Set<number>>();
  const seen = new Set<string>();
  const root = graph.rootPersonId;
  const stack: Array<{ personId: number; relationId: number | null }> = [
    { personId: root, relationId: null },
  ];
  reachable.add(root);

  while (stack.length > 0) {
    const current = stack.pop()!;
    const key = `${current.personId}|${current.relationId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let children: Array<{ personId: number; relationId: number | null }>;
    const byPosition =
      current.relationId != null
        ? index.byParentRelation.get(current.relationId)
        : undefined;
    if (byPosition && byPosition.length > 0) {
      // Una posición manda sobre las aristas normales, pero no oculta a los
      // colaboradores asignados desde Planta (aristas sintéticas, id < 0).
      children = [
        ...byPosition.map((row) => ({ personId: row.child_person_id, relationId: null })),
        ...(index.byParentPerson.get(current.personId) ?? [])
          .filter((edge) => edge.id < 0)
          .map((edge) => ({ personId: edge.child_person_id, relationId: edge.id })),
      ];
    } else {
      children = (index.byParentPerson.get(current.personId) ?? []).map((edge) => ({
        personId: edge.child_person_id,
        relationId: edge.id,
      }));
    }

    for (const child of children) {
      if (child.personId === current.personId) continue;
      reachable.add(child.personId);
      if (!parentOf.has(child.personId)) parentOf.set(child.personId, current.personId);
      let team = childrenOf.get(current.personId);
      if (!team) {
        team = new Set();
        childrenOf.set(current.personId, team);
      }
      team.add(child.personId);
      stack.push(child);
    }
  }

  return { reachable, parentOf, childrenOf };
}
