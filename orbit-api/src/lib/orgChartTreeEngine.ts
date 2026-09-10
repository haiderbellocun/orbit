/**
 * Motor de hijos del organigrama (prioridad estricta).
 * 1) position_child por relation_id
 * 2) aristas org_visual_relation por parent_person_id
 * 3) (fallback por rol: no se usa en Planta Activa — la BD ya tiene aristas)
 */

export type OrgEdge = {
  id: number;
  parent_person_id: number;
  child_person_id: number;
  visual_level: number | null;
};

export type OrgPositionChild = {
  parent_relation_id: number;
  child_person_id: number;
  visual_level: number | null;
};

export type OrgChildRef = {
  personId: number;
  relationId: number | null;
  visualLevel: number | null;
  source: "position" | "relation";
};

export function buildChildIndex(input: {
  relations: readonly OrgEdge[];
  positionChildren: readonly OrgPositionChild[];
}): {
  byParentPerson: Map<number, OrgEdge[]>;
  byParentRelation: Map<number, OrgPositionChild[]>;
} {
  const byParentPerson = new Map<number, OrgEdge[]>();
  for (const edge of input.relations) {
    const list = byParentPerson.get(edge.parent_person_id) ?? [];
    list.push(edge);
    byParentPerson.set(edge.parent_person_id, list);
  }
  const byParentRelation = new Map<number, OrgPositionChild[]>();
  for (const row of input.positionChildren) {
    const list = byParentRelation.get(row.parent_relation_id) ?? [];
    list.push(row);
    byParentRelation.set(row.parent_relation_id, list);
  }
  return { byParentPerson, byParentRelation };
}

export function childrenForPerson(
  parentPersonId: number,
  parentRelationId: number | null | undefined,
  index: ReturnType<typeof buildChildIndex>
): OrgChildRef[] {
  if (parentRelationId != null) {
    const byPosition = index.byParentRelation.get(parentRelationId);
    if (byPosition && byPosition.length > 0) {
      return byPosition.map((row) => ({
        personId: row.child_person_id,
        relationId: null,
        visualLevel: row.visual_level,
        source: "position" as const,
      }));
    }
  }
  const byPerson = index.byParentPerson.get(parentPersonId) ?? [];
  return byPerson.map((edge) => ({
    personId: edge.child_person_id,
    relationId: edge.id,
    visualLevel: edge.visual_level,
    source: "relation" as const,
  }));
}

export function orgNodeKey(
  personId: number | string,
  relationId: number | null | undefined,
  parentRelationId?: number | null
): string {
  if (relationId != null) return `rel:${relationId}`;
  if (parentRelationId != null) {
    return `pos:${parentRelationId}:${personId}`;
  }
  return `person:${personId}`;
}

export type PlantaOrgOverride = {
  person_id: number;
  parent_person_id: number | null;
};

/** Aristas sintéticas de Planta: id negativo = -child_person_id */
export function plantaOverrideEdgeId(childPersonId: number): number {
  return -Math.abs(childPersonId);
}

/**
 * Organigrama es la base. Los overrides de Planta Activa ganan por persona:
 * - con padre → cuelga de ese padre (y desaparece de padres del organigrama)
 * - sin padre → queda sin responsable en Planta (el organigrama no se toca)
 */
export function applyPlantaOrgOverrides(
  relations: readonly OrgEdge[],
  positionChildren: readonly OrgPositionChild[],
  overrides: readonly PlantaOrgOverride[]
): { relations: OrgEdge[]; positionChildren: OrgPositionChild[] } {
  const byChild = new Map<number, number | null>();
  for (const row of overrides) {
    byChild.set(row.person_id, row.parent_person_id);
  }
  const nextRelations = relations.filter((edge) => !byChild.has(edge.child_person_id));
  const nextPositions = positionChildren.filter(
    (row) => !byChild.has(row.child_person_id)
  );
  for (const [childId, parentId] of byChild) {
    if (parentId == null) continue;
    nextRelations.push({
      id: plantaOverrideEdgeId(childId),
      parent_person_id: parentId,
      child_person_id: childId,
      visual_level: null,
    });
  }
  return { relations: nextRelations, positionChildren: nextPositions };
}

export function parentByChildFromRelations(
  relations: readonly OrgEdge[]
): Map<number, number[]> {
  const parentByChild = new Map<number, number[]>();
  for (const edge of relations) {
    const list = parentByChild.get(edge.child_person_id) ?? [];
    list.push(edge.parent_person_id);
    parentByChild.set(edge.child_person_id, list);
  }
  return parentByChild;
}

export function assignmentCreatesOrgCycle(
  childPersonId: number,
  newParentPersonId: number,
  parentByChild: ReadonlyMap<number, number[]>
): boolean {
  if (childPersonId === newParentPersonId) return true;
  const seen = new Set<number>();
  const stack = [newParentPersonId];
  while (stack.length > 0) {
    const cursor = stack.pop();
    if (cursor == null) continue;
    if (cursor === childPersonId) return true;
    if (seen.has(cursor)) continue;
    seen.add(cursor);
    const parents = parentByChild.get(cursor) ?? [];
    stack.push(...parents);
  }
  return false;
}

/**
 * Personas visibles para una vista jerarquica personal: toda la cadena de
 * superiores y toda la rama de descendientes, incluyendo al usuario.
 */
export function collectHierarchyLinePersonIds(
  personId: number,
  relations: readonly OrgEdge[],
  positionChildren: readonly OrgPositionChild[]
): Set<number> {
  const parents = new Map<number, Set<number>>();
  const children = new Map<number, Set<number>>();
  const add = (parentId: number, childId: number) => {
    const ps = parents.get(childId) ?? new Set<number>();
    ps.add(parentId);
    parents.set(childId, ps);
    const cs = children.get(parentId) ?? new Set<number>();
    cs.add(childId);
    children.set(parentId, cs);
  };

  const relationChild = new Map<number, number>();
  for (const edge of relations) {
    relationChild.set(edge.id, edge.child_person_id);
    add(edge.parent_person_id, edge.child_person_id);
  }
  for (const row of positionChildren) {
    const parentId = relationChild.get(row.parent_relation_id);
    if (parentId != null) add(parentId, row.child_person_id);
  }

  const visible = new Set<number>([personId]);
  const walk = (index: ReadonlyMap<number, Set<number>>) => {
    const stack = [personId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of index.get(current) ?? []) {
        if (visible.has(next)) continue;
        visible.add(next);
        stack.push(next);
      }
    }
  };
  walk(parents);
  walk(children);
  return visible;
}

/** Descendientes de una persona, sin incluir a la persona ni sus superiores. */
export function collectHierarchyDescendantPersonIds(
  personId: number,
  relations: readonly OrgEdge[],
  positionChildren: readonly OrgPositionChild[]
): Set<number> {
  const children = new Map<number, Set<number>>();
  const add = (parentId: number, childId: number) => {
    const list = children.get(parentId) ?? new Set<number>();
    list.add(childId);
    children.set(parentId, list);
  };
  const relationChild = new Map<number, number>();
  for (const edge of relations) {
    relationChild.set(edge.id, edge.child_person_id);
    add(edge.parent_person_id, edge.child_person_id);
  }
  for (const row of positionChildren) {
    const parentId = relationChild.get(row.parent_relation_id);
    if (parentId != null) add(parentId, row.child_person_id);
  }
  const descendants = new Set<number>();
  const stack = [...(children.get(personId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (descendants.has(current)) continue;
    descendants.add(current);
    stack.push(...(children.get(current) ?? []));
  }
  return descendants;
}
