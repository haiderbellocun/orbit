import type { AreaGroup, OrganizationForest, OrganizationNode } from '@/src/lib/organizationTree';
import { splitReports } from '@/src/lib/organizationTree';
import { isOrgApexPerson } from '@/src/lib/schoolAccent';

export type WheelEntry = {
  key: string;
  kind: 'node' | 'unassigned' | 'area';
  label: string;
  hint: string;
  node: OrganizationNode | null;
  areaName?: string;
  initials?: boolean;
  /** Logo fijo (ruta en /public) cuando la opción no tiene emblema propio. */
  image?: string;
  canDrill: boolean;
  childCount: number;
};

function clip(text: string, max = 64): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function drillChildren(node: OrganizationNode): OrganizationNode[] {
  const { nested, collaborators } = splitReports(node);
  return [...nested, ...collaborators];
}

export function entryFromNode(node: OrganizationNode): WheelEntry {
  const person = node.person;
  const children = drillChildren(node);
  const apex = isOrgApexPerson(person);
  const area = person.area?.trim() || '';
  const role = person.role_name?.trim() || '';
  let label = person.name;
  let hint = role || 'Sin rol';
  if (apex) {
    label = area || role || person.name;
    hint = person.name;
  } else if (node.band === 'coordinator') {
    label = role && role.toLowerCase() !== area.toLowerCase() ? role : person.name;
    hint = label === person.name ? role || area : person.name;
  } else if (node.band === 'leader') {
    label = person.name;
    hint = person.school?.trim() || person.program?.trim() || role;
  }
  return {
    key: node.nodeKey,
    kind: 'node',
    label: clip(label, 72),
    hint: clip(hint, 80),
    node,
    canDrill: children.length > 0,
    childCount: children.length,
  };
}

export function listForestRoots(forest: OrganizationForest): OrganizationNode[] {
  const apex: OrganizationNode[] = [];
  const rest: OrganizationNode[] = [];
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const node of school.roots) {
        if (isOrgApexPerson(node.person)) apex.push(node);
        else rest.push(node);
      }
    }
  }
  return [...apex, ...rest];
}

export function isAreaCatalog(forest: OrganizationForest): boolean {
  if (forest.areas.length === 0) return false;
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const root of school.roots) {
        if (root.children.length > 0) return false;
      }
    }
  }
  return true;
}

export function areaPeople(area: AreaGroup): OrganizationNode[] {
  const nodes = area.schools.flatMap((school) => school.roots);
  return [...nodes].sort((a, b) => {
    if (b.hierarchyLevel !== a.hierarchyLevel) return b.hierarchyLevel - a.hierarchyLevel;
    return a.person.name.localeCompare(b.person.name, 'es', { sensitivity: 'base' });
  });
}

function entryFromArea(area: AreaGroup): WheelEntry {
  const people = areaPeople(area);
  const count = people.length;
  return {
    key: `area:${area.key}`,
    kind: 'area',
    label: clip(area.areaName, 72),
    hint: `${count.toLocaleString('es-CO')} persona${count === 1 ? '' : 's'}`,
    node: null,
    areaName: area.areaName,
    canDrill: count > 0,
    childCount: count,
  };
}

export function areaWheelEntries(area: AreaGroup): WheelEntry[] {
  return areaPeople(area).map(entryFromNode);
}

export function topWheelEntries(forest: OrganizationForest): WheelEntry[] {
  const catalog = isAreaCatalog(forest);
  const entries = catalog
    ? forest.areas.map(entryFromArea)
    : listForestRoots(forest).map(entryFromNode);
  const loose = unassignedWheelEntry(forest, catalog);
  if (loose) entries.push(loose);
  return entries;
}

/** Opción "Sin responsable" (o "Sin área" en el catálogo), si hay personas. */
export function unassignedWheelEntry(
  forest: OrganizationForest,
  catalog = isAreaCatalog(forest)
): WheelEntry | null {
  const count = forest.unassigned.length;
  if (count === 0) return null;
  return {
    key: 'unassigned',
    kind: 'unassigned',
    label: catalog ? 'Sin área' : 'Sin responsable',
    hint: `${count.toLocaleString('es-CO')} persona${count === 1 ? '' : 's'}`,
    node: null,
    canDrill: false,
    childCount: count,
    image: 'sin_area.png',
  };
}

export function childWheelEntries(node: OrganizationNode): WheelEntry[] {
  return drillChildren(node).map(entryFromNode);
}

export function indexOrganizationNodes(
  forest: OrganizationForest
): Map<string, OrganizationNode> {
  const map = new Map<string, OrganizationNode>();
  const walk = (node: OrganizationNode) => {
    map.set(node.nodeKey, node);
    for (const child of node.children) walk(child);
  };
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const root of school.roots) walk(root);
    }
  }
  return map;
}

export function scopeForestToNode(
  node: OrganizationNode,
  forest: OrganizationForest
): OrganizationForest {
  return {
    areas: [
      {
        key: `radial-${node.nodeKey}`,
        areaId: node.person.area_id,
        areaName: node.person.area?.trim() || 'Planta activa',
        schools: [
          {
            key: `radial-s-${node.nodeKey}`,
            schoolId: node.person.school_id,
            schoolName:
              node.person.school?.trim() ||
              node.person.role_name?.trim() ||
              'Unidad',
            roots: [node],
          },
        ],
      },
    ],
    unassigned: [],
    counts: forest.counts,
  };
}

export function crumbLabel(node: OrganizationNode): string {
  if (isOrgApexPerson(node.person)) {
    return node.person.area?.trim() || node.person.name;
  }
  if (node.band === 'coordinator') {
    const role = node.person.role_name?.trim() || '';
    const area = node.person.area?.trim() || '';
    if (role && role.toLowerCase() !== area.toLowerCase()) return role;
  }
  return node.person.name;
}
