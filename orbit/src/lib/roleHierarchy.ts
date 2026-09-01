/**
 * Prioridad de cargos para planta activa.
 * Fuente única en frontend; no repetir en componentes.
 * Roles no reconocidos quedan al final (0) sin romper el árbol.
 */

export const ROLE_HIERARCHY_LEVEL = {
  COORDINATOR: 100,
  LEADER: 80,
  PROFESSIONAL: 60,
  ANALYST: 40,
  AUXILIARY: 20,
  FACULTY: 10,
  OTHER: 0,
} as const;

export type RoleBand =
  | 'coordinator'
  | 'leader'
  | 'professional'
  | 'analyst'
  | 'auxiliary'
  | 'faculty'
  | 'other';

export function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function labelsForRole(input: {
  roleName?: string | null;
  roleCode?: string | null;
}): string[] {
  const out: string[] = [];
  const name = normalizeRoleLabel(input.roleName);
  const code = normalizeRoleLabel(input.roleCode);
  if (name) out.push(name);
  if (code && code !== name) out.push(code);
  return out;
}

function matchesAny(
  labels: readonly string[],
  pred: (label: string) => boolean
): boolean {
  return labels.some(pred);
}

export function getRoleBand(input: {
  roleName?: string | null;
  roleCode?: string | null;
}): RoleBand {
  const labels = labelsForRole(input);
  if (labels.length === 0) return 'other';

  if (
    matchesAny(
      labels,
      (l) =>
        l.includes('COORDINADOR') ||
        l.includes('COORDINADORA') ||
        l.includes('JEFATURA') ||
        l === 'JEFE' ||
        l.startsWith('JEFE ') ||
        l.startsWith('JEFA ')
    )
  ) {
    return 'coordinator';
  }

  if (
    matchesAny(
      labels,
      (l) =>
        l === 'LITE' ||
        l === 'LIDER' ||
        l.startsWith('LIDER ') ||
        l.startsWith('LITE ') ||
        l.includes(' LITE') ||
        l.includes('LIDER ACADEMICO') ||
        l.includes('LIDER ACADEMICA')
    )
  ) {
    return 'leader';
  }

  if (matchesAny(labels, (l) => l.includes('PROFESIONAL'))) {
    return 'professional';
  }

  if (matchesAny(labels, (l) => l.includes('ANALISTA'))) {
    return 'analyst';
  }

  if (matchesAny(labels, (l) => l.includes('AUXILIAR'))) {
    return 'auxiliary';
  }

  if (
    matchesAny(
      labels,
      (l) =>
        l === 'DOCENTE' ||
        l === 'DOCENTES' ||
        l.startsWith('DOCENTES ') ||
        l.startsWith('DOCENTE ')
    )
  ) {
    return 'faculty';
  }

  return 'other';
}

export function getRoleHierarchyLevel(input: {
  roleName?: string | null;
  roleCode?: string | null;
}): number {
  const band = getRoleBand(input);
  switch (band) {
    case 'coordinator':
      return ROLE_HIERARCHY_LEVEL.COORDINATOR;
    case 'leader':
      return ROLE_HIERARCHY_LEVEL.LEADER;
    case 'professional':
      return ROLE_HIERARCHY_LEVEL.PROFESSIONAL;
    case 'analyst':
      return ROLE_HIERARCHY_LEVEL.ANALYST;
    case 'auxiliary':
      return ROLE_HIERARCHY_LEVEL.AUXILIARY;
    case 'faculty':
      return ROLE_HIERARCHY_LEVEL.FACULTY;
    default:
      return ROLE_HIERARCHY_LEVEL.OTHER;
  }
}

export function canHaveDirectReports(input: {
  roleName?: string | null;
  roleCode?: string | null;
}): boolean {
  const band = getRoleBand(input);
  return band === 'coordinator' || band === 'leader';
}

export function personInitials(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
