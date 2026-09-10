import type { PlantaPerson } from '@/src/types';
import { isHarveyAreaName } from '@/src/lib/harveyArea';
import {
  canHaveDirectReports,
  getRoleBand,
  getRoleHierarchyLevel,
  type RoleBand,
} from '@/src/lib/roleHierarchy';
import type { OrgChartGraphPayload } from '@/src/types';

/** Área Harvey/investigación no entra al panel «Sin responsable asignado». */
function isPlantaUnassignedCandidate(person: PlantaPerson): boolean {
  return !isHarveyAreaName(person.area);
}

export type OrganizationNode = {
  person: PlantaPerson;
  nodeKey: string;
  relationId: number | null;
  parentPersonId: number | null;
  visualLevel: number | null;
  assignmentStatus: string | null;
  assignmentLabel: string | null;
  hierarchyLevel: number;
  band: RoleBand;
  children: OrganizationNode[];
  directReportsCount: number;
  totalReportsCount: number;
  leaderCount: number;
  isContextOnly?: boolean;
};

export type SchoolGroup = {
  key: string;
  schoolId: number | null;
  schoolName: string;
  roots: OrganizationNode[];
};

export type AreaGroup = {
  key: string;
  areaId: number | null;
  areaName: string;
  schools: SchoolGroup[];
};

export type OrganizationForest = {
  areas: AreaGroup[];
  unassigned: PlantaPerson[];
  counts: {
    total: number;
    coordinators: number;
    leaders: number;
    collaborators: number;
    unassigned: number;
  };
};

type ChildRef = {
  personId: number;
  relationId: number | null;
  visualLevel: number | null;
  parentRelationId: number | null;
};

function roleInput(person: PlantaPerson) {
  return { roleName: person.role_name, roleCode: person.role_code };
}

export function orgNodeKey(
  personId: string,
  relationId: number | null,
  parentRelationId?: number | null
): string {
  if (relationId != null) return `rel:${relationId}`;
  if (parentRelationId != null) return `pos:${parentRelationId}:${personId}`;
  return `person:${personId}`;
}

function sortNodes(a: OrganizationNode, b: OrganizationNode): number {
  const va = a.visualLevel ?? 999;
  const vb = b.visualLevel ?? 999;
  if (va !== vb) return va - vb;
  if (b.hierarchyLevel !== a.hierarchyLevel) {
    return b.hierarchyLevel - a.hierarchyLevel;
  }
  const idA = Number(a.person.id);
  const idB = Number(b.person.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB;
  }
  return a.person.name.localeCompare(b.person.name, 'es', { sensitivity: 'base' });
}

function countLeaders(children: OrganizationNode[]): number {
  return children.filter(
    (c) => c.band === 'leader' || c.band === 'coordinator' || isBranchNode(c)
  ).length;
}

export function isBranchNode(node: OrganizationNode): boolean {
  return (
    canHaveDirectReports(roleInput(node.person)) || node.children.length > 0
  );
}

export function splitReports(node: OrganizationNode): {
  nested: OrganizationNode[];
  collaborators: OrganizationNode[];
} {
  const nested: OrganizationNode[] = [];
  const collaborators: OrganizationNode[] = [];
  for (const child of node.children) {
    if (isBranchNode(child)) nested.push(child);
    else collaborators.push(child);
  }
  return { nested, collaborators };
}

function childIndex(graph: OrgChartGraphPayload) {
  const byParentPerson = new Map<number, OrgChartGraphPayload['relations']>();
  for (const edge of graph.relations) {
    const list = byParentPerson.get(edge.parent_person_id) ?? [];
    list.push(edge);
    byParentPerson.set(edge.parent_person_id, list);
  }
  const byParentRelation = new Map<
    number,
    OrgChartGraphPayload['position_children']
  >();
  for (const row of graph.position_children) {
    const list = byParentRelation.get(row.parent_relation_id) ?? [];
    list.push(row);
    byParentRelation.set(row.parent_relation_id, list);
  }
  return { byParentPerson, byParentRelation };
}

function childrenFor(
  parentPersonId: number,
  parentRelationId: number | null,
  index: ReturnType<typeof childIndex>
): ChildRef[] {
  if (parentRelationId != null) {
    const byPos = index.byParentRelation.get(parentRelationId);
    if (byPos && byPos.length > 0) {
      return byPos.map((row) => ({
        personId: row.child_person_id,
        relationId: null,
        visualLevel: row.visual_level,
        parentRelationId,
      }));
    }
  }
  const byPerson = index.byParentPerson.get(parentPersonId) ?? [];
  return byPerson.map((edge) => ({
    personId: edge.child_person_id,
    relationId: edge.id,
    visualLevel: edge.visual_level,
    parentRelationId: null,
  }));
}

function applyOverrides(
  person: PlantaPerson,
  relationId: number | null,
  graph: OrgChartGraphPayload
): PlantaPerson {
  const personOv = graph.person_overrides.find(
    (o) => o.person_id === Number(person.id)
  );
  const relOv =
    relationId != null
      ? graph.relation_overrides.find((o) => o.relation_id === relationId)
      : undefined;
  let next = person;
  if (personOv?.display_name_override) {
    next = { ...next, name: personOv.display_name_override };
  }
  const roleId = relOv?.role_id_override ?? personOv?.role_id_override;
  if (roleId != null && roleId !== person.role_id) {
    next = { ...next, role_id: roleId };
  }
  return next;
}

function toNode(
  person: PlantaPerson,
  relationId: number | null,
  parentPersonId: number | null,
  visualLevel: number | null,
  parentRelationId: number | null,
  peopleById: Map<string, PlantaPerson>,
  graph: OrgChartGraphPayload,
  index: ReturnType<typeof childIndex>,
  visiting: Set<string>
): OrganizationNode {
  const nodeKey = orgNodeKey(person.id, relationId, parentRelationId);
  const displayed = applyOverrides(person, relationId, graph);
  const relOv =
    relationId != null
      ? graph.relation_overrides.find((o) => o.relation_id === relationId)
      : undefined;
  const plantaOv = (graph.planta_overrides ?? []).find(
    (o) => o.person_id === Number(person.id)
  );
  const assignmentLabel = plantaOv
    ? plantaOv.parent_person_id == null
      ? 'Sin responsable (Planta Activa)'
      : relOv?.assignment_label || 'Ajuste de Planta Activa'
    : relOv?.assignment_label ?? null;
  const assignmentStatus = plantaOv
    ? 'TEMPORAL'
    : relOv?.assignment_status ?? null;

  if (visiting.has(nodeKey)) {
    return {
      person: displayed,
      nodeKey,
      relationId,
      parentPersonId,
      visualLevel,
      assignmentStatus,
      assignmentLabel,
      hierarchyLevel: getRoleHierarchyLevel(roleInput(displayed)),
      band: getRoleBand(roleInput(displayed)),
      children: [],
      directReportsCount: 0,
      totalReportsCount: 0,
      leaderCount: 0,
    };
  }
  visiting.add(nodeKey);

  const refs = childrenFor(Number(person.id), relationId, index);
  const children: OrganizationNode[] = [];
  for (const ref of refs) {
    const child = peopleById.get(String(ref.personId));
    if (!child) continue;
    children.push(
      toNode(
        child,
        ref.relationId,
        Number(person.id),
        ref.visualLevel,
        ref.parentRelationId,
        peopleById,
        graph,
        index,
        visiting
      )
    );
  }
  children.sort(sortNodes);
  visiting.delete(nodeKey);

  const totalReportsCount = children.reduce(
    (sum, child) => sum + 1 + child.totalReportsCount,
    0
  );
  return {
    person: displayed,
    nodeKey,
    relationId,
    parentPersonId,
    visualLevel,
    assignmentStatus,
    assignmentLabel,
    hierarchyLevel: getRoleHierarchyLevel(roleInput(displayed)),
    band: getRoleBand(roleInput(displayed)),
    children,
    directReportsCount: children.length,
    totalReportsCount,
    leaderCount: countLeaders(children),
  };
}

function personHasTeam(
  personId: number,
  index: ReturnType<typeof childIndex>
): boolean {
  const byPerson = index.byParentPerson.get(personId);
  if (byPerson && byPerson.length > 0) return true;
  for (const edge of byPerson ?? []) {
    const pos = index.byParentRelation.get(edge.id);
    if (pos && pos.length > 0) return true;
  }
  return false;
}

/** Solo coordinadores/líderes (o quien ya tiene equipo) encabezan una rama. */
function shouldPromoteAsRoot(
  person: PlantaPerson,
  index: ReturnType<typeof childIndex>
): boolean {
  if (canHaveDirectReports(roleInput(person))) return true;
  return personHasTeam(Number(person.id), index);
}

function collectReachableIds(roots: OrganizationNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrganizationNode) => {
    ids.add(node.person.id);
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return ids;
}

function groupRoots(roots: OrganizationNode[]): AreaGroup[] {
  const areaMap = new Map<string, AreaGroup>();
  for (const node of roots) {
    const areaId = node.person.area_id;
    const areaName = node.person.area?.trim() || 'Sin área';
    const areaKey = areaId != null ? `a-${areaId}` : 'a-none';
    let area = areaMap.get(areaKey);
    if (!area) {
      area = { key: areaKey, areaId, areaName, schools: [] };
      areaMap.set(areaKey, area);
    }
    const schoolId = node.person.school_id;
    const schoolName = node.person.school?.trim() || 'Sin escuela';
    const schoolKey = schoolId != null ? `s-${schoolId}` : 's-none';
    let school = area.schools.find((s) => s.key === schoolKey);
    if (!school) {
      school = { key: schoolKey, schoolId, schoolName, roots: [] };
      area.schools.push(school);
    }
    school.roots.push(node);
  }
  const areas = [...areaMap.values()].sort((a, b) => {
    if (a.areaId == null && b.areaId != null) return 1;
    if (a.areaId != null && b.areaId == null) return -1;
    return a.areaName.localeCompare(b.areaName, 'es', { sensitivity: 'base' });
  });
  for (const area of areas) {
    area.schools.sort((a, b) => {
      if (a.schoolId == null && b.schoolId != null) return 1;
      if (a.schoolId != null && b.schoolId == null) return -1;
      return a.schoolName.localeCompare(b.schoolName, 'es', {
        sensitivity: 'base',
      });
    });
    for (const school of area.schools) school.roots.sort(sortNodes);
  }
  return areas;
}

/**
 * Árbol desde Organigrama: aristas reales (posición → persona).
 * No usa core.hierarchy ni school/programa para colgar gente.
 */
export function buildOrganizationHierarchy(
  people: readonly PlantaPerson[],
  graph: OrgChartGraphPayload | null
): OrganizationForest {
  const byId = new Map<string, PlantaPerson>();
  for (const person of people) byId.set(person.id, person);

  let coordinators = 0;
  let leaders = 0;
  for (const person of people) {
    const band = getRoleBand(roleInput(person));
    if (band === 'coordinator') coordinators += 1;
    else if (band === 'leader') leaders += 1;
  }

  const emptyCounts = {
    total: people.length,
    coordinators,
    leaders,
    collaborators: Math.max(0, people.length - coordinators - leaders),
    unassigned: people.length,
  };

  if (graph == null || graph.relations.length === 0) {
    const unassigned = people
      .filter(isPlantaUnassignedCandidate)
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
    return { areas: [], unassigned, counts: { ...emptyCounts, unassigned: unassigned.length } };
  }

  const index = childIndex(graph);
  const visibleIds = new Set(byId.keys());
  const visiting = new Set<string>();

  const rootId = String(graph.root_person_id);
  const roots: OrganizationNode[] = [];
  const rootPerson = byId.get(rootId);

  if (rootPerson) {
    roots.push(
      toNode(
        rootPerson,
        null,
        null,
        1,
        null,
        byId,
        graph,
        index,
        visiting
      )
    );
  } else {
    const rootChildren = childrenFor(graph.root_person_id, null, index);
    for (const ref of rootChildren) {
      const person = byId.get(String(ref.personId));
      if (!person || !shouldPromoteAsRoot(person, index)) continue;
      roots.push(
        toNode(
          person,
          ref.relationId,
          graph.root_person_id,
          ref.visualLevel,
          ref.parentRelationId,
          byId,
          graph,
          index,
          visiting
        )
      );
    }
    if (roots.length === 0) {
      const parentVisible = (parentId: number) => visibleIds.has(String(parentId));
      const childIds = new Set(
        graph.relations
          .filter((e) => parentVisible(e.parent_person_id))
          .map((e) => String(e.child_person_id))
      );
      for (const person of people) {
        if (childIds.has(person.id)) continue;
        const hasVisibleParent = graph.relations.some(
          (e) =>
            String(e.child_person_id) === person.id &&
            parentVisible(e.parent_person_id)
        );
        if (hasVisibleParent) continue;
        const outgoing = index.byParentPerson.get(Number(person.id));
        if (!outgoing || outgoing.length === 0) continue;
        if (!shouldPromoteAsRoot(person, index)) continue;
        roots.push(
          toNode(person, null, null, null, null, byId, graph, index, visiting)
        );
      }
    }
  }

  roots.sort(sortNodes);
  let reached = collectReachableIds(roots);
  for (const person of people) {
    if (reached.has(person.id)) continue;
    const parentIds = graph.relations
      .filter((e) => String(e.child_person_id) === person.id)
      .map((e) => String(e.parent_person_id));
    if (parentIds.length === 0) continue;
    const parentInView = parentIds.some((id) => visibleIds.has(id));
    if (parentInView) continue;
    if (!shouldPromoteAsRoot(person, index)) continue;
    const edge = graph.relations.find(
      (e) => String(e.child_person_id) === person.id
    );
    roots.push(
      toNode(
        person,
        edge?.id ?? null,
        edge?.parent_person_id ?? null,
        edge?.visual_level ?? null,
        null,
        byId,
        graph,
        index,
        visiting
      )
    );
  }
  roots.sort(sortNodes);
  reached = collectReachableIds(roots);
  const unassigned = people
    .filter((p) => !reached.has(p.id) && isPlantaUnassignedCandidate(p))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  return {
    areas: groupRoots(roots),
    unassigned,
    counts: {
      ...emptyCounts,
      unassigned: unassigned.length,
    },
  };
}

export function personMatchesQuery(
  person: PlantaPerson,
  query: string
): boolean {
  const normalizeSearchText = (value: unknown): string =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // Cada palabra puede coincidir con un campo distinto. Por ejemplo,
  // "ingenieria coordinador" encuentra por escuela + cargo aunque las
  // palabras no estén juntas ni en el mismo orden dentro del registro.
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = normalizeSearchText([
    person.name,
    person.document,
    person.type_document,
    person.email,
    person.edu_email,
    person.phone,
    person.address,
    person.area,
    person.school,
    person.program,
    person.role_name,
    person.role_code,
    person.manager_name,
    person.manager_role_name,
    person.manager_document,
    ...(person.second_in_command_scopes ?? []),
  ].join(' '));

  return terms.every((term) => searchableText.includes(term));
}

export type PersonMatchPredicate = (person: PlantaPerson) => boolean;

function filterNode(
  node: OrganizationNode,
  pred: PersonMatchPredicate
): OrganizationNode | null {
  const children = node.children
    .map((child) => filterNode(child, pred))
    .filter((child): child is OrganizationNode => child != null);
  const self = pred(node.person);
  if (!self && children.length === 0) return null;
  const totalReportsCount = children.reduce(
    (sum, child) => sum + 1 + child.totalReportsCount,
    0
  );
  return {
    ...node,
    children,
    isContextOnly: !self,
    directReportsCount: children.length,
    totalReportsCount,
    leaderCount: countLeaders(children),
  };
}

export function filterOrganizationForest(
  forest: OrganizationForest,
  pred: PersonMatchPredicate
): OrganizationForest {
  const areas: AreaGroup[] = [];
  for (const area of forest.areas) {
    const schools: SchoolGroup[] = [];
    for (const school of area.schools) {
      const roots = school.roots
        .map((node) => filterNode(node, pred))
        .filter((node): node is OrganizationNode => node != null);
      if (roots.length > 0) schools.push({ ...school, roots });
    }
    if (schools.length > 0) areas.push({ ...area, schools });
  }
  const unassigned = forest.unassigned.filter(pred);
  return { ...forest, areas, unassigned };
}

export function collectExpandableIds(
  forest: OrganizationForest
): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrganizationNode) => {
    if (node.children.length > 0) {
      ids.add(node.nodeKey);
      for (const child of node.children) walk(child);
    }
  };
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const root of school.roots) walk(root);
    }
  }
  return ids;
}

export function collectDescendantIds(
  people: readonly PlantaPerson[],
  personId: string,
  graph: OrgChartGraphPayload | null
): Set<string> {
  const out = new Set<string>();
  if (graph == null) return out;
  const index = childIndex(graph);
  const stack = childrenFor(Number(personId), null, index).map((c) =>
    String(c.personId)
  );
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    for (const ref of childrenFor(Number(id), null, index)) {
      stack.push(String(ref.personId));
    }
  }
  return out;
}

export function findCoordinatorAndLeader(
  people: readonly PlantaPerson[],
  person: PlantaPerson,
  graph: OrgChartGraphPayload | null
): { coordinator: PlantaPerson | null; leader: PlantaPerson | null } {
  if (graph == null) {
    return { coordinator: null, leader: null };
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = graph.relations
    .filter((e) => String(e.child_person_id) === person.id)
    .map((e) => byId.get(String(e.parent_person_id)))
    .filter((p): p is PlantaPerson => p != null);

  let coordinator: PlantaPerson | null = null;
  let leader: PlantaPerson | null = null;
  const seen = new Set<string>();
  const queue = [...parents];
  while (queue.length > 0) {
    const ancestor = queue.shift();
    if (!ancestor || seen.has(ancestor.id)) continue;
    seen.add(ancestor.id);
    const band = getRoleBand(roleInput(ancestor));
    if (band === 'leader' && leader == null) leader = ancestor;
    if (band === 'coordinator' && coordinator == null) coordinator = ancestor;
    for (const edge of graph.relations) {
      if (String(edge.child_person_id) === ancestor.id) {
        const next = byId.get(String(edge.parent_person_id));
        if (next) queue.push(next);
      }
    }
  }
  return { coordinator, leader };
}

export function parseOrgChartGraph(raw: unknown): OrgChartGraphPayload | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Partial<OrgChartGraphPayload>;
  if (o.version == null || typeof o.version !== 'object') return null;
  if (!Array.isArray(o.relations) || !Array.isArray(o.position_children)) {
    return null;
  }
  const rootId = Number(o.root_person_id);
  if (!Number.isFinite(rootId)) return null;
  return {
    version: {
      id: Number(o.version.id),
      code: String(o.version.code ?? ''),
      name: String(o.version.name ?? ''),
      period_label: o.version.period_label ?? null,
      is_locked: Boolean(o.version.is_locked),
    },
    root_person_id: rootId,
    can_mutate: o.can_mutate !== false,
    relations: o.relations,
    position_children: o.position_children,
    person_overrides: Array.isArray(o.person_overrides)
      ? o.person_overrides
      : [],
    relation_overrides: Array.isArray(o.relation_overrides)
      ? o.relation_overrides
      : [],
    planta_overrides: Array.isArray(o.planta_overrides)
      ? o.planta_overrides
      : [],
  };
}

export function orgParentIdsOf(
  personId: string,
  graph: OrgChartGraphPayload | null
): number[] {
  if (graph == null) return [];
  return graph.relations
    .filter((e) => String(e.child_person_id) === personId)
    .map((e) => e.parent_person_id);
}

export function overlayOrgParents(
  people: readonly PlantaPerson[],
  graph: OrgChartGraphPayload | null
): PlantaPerson[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return people.map((person) => {
    const parentIds = orgParentIdsOf(person.id, graph);
    const first = parentIds[0];
    if (first == null) {
      return {
        ...person,
        manager_id: null,
        manager_name: null,
        manager_role_name: null,
      };
    }
    const mgr = byId.get(String(first));
    return {
      ...person,
      manager_id: first,
      manager_name: mgr?.name ?? 'Fuera de tu alcance',
      manager_role_name: mgr?.role_name ?? null,
    };
  });
}

export function directReportsOf(
  personId: string,
  people: readonly PlantaPerson[],
  graph: OrgChartGraphPayload | null
): PlantaPerson[] {
  if (graph == null) return [];
  const index = childIndex(graph);
  const byId = new Map(people.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: PlantaPerson[] = [];
  for (const ref of childrenFor(Number(personId), null, index)) {
    const id = String(ref.personId);
    if (seen.has(id)) continue;
    seen.add(id);
    const person = byId.get(id);
    if (person) out.push(person);
  }
  return out.sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );
}

export function directManagerOf(
  person: PlantaPerson,
  people: readonly PlantaPerson[],
  graph: OrgChartGraphPayload | null
): PlantaPerson | null {
  if (graph == null) return null;
  const edge = graph.relations.find(
    (e) => String(e.child_person_id) === person.id
  );
  if (!edge) return null;
  return people.find((p) => p.id === String(edge.parent_person_id)) ?? null;
}
