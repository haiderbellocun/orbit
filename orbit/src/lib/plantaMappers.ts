import type { PlantaPerson } from '@/src/types';

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapPlantaFromApi(row: Record<string, unknown>): PlantaPerson {
  const st = String(row.status ?? 'active');
  return {
    second_in_command_scopes: Array.isArray(row.second_in_command_scopes) ? row.second_in_command_scopes.filter((v): v is string => typeof v === 'string') : [],
    id: String(row.id ?? ''),
    document: String(row.document ?? ''),
    type_document: row.type_document ? String(row.type_document) : undefined,
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    edu_email: String(row.edu_email ?? ''),
    phone: String(row.phone ?? ''),
    address: row.address ? String(row.address) : undefined,
    area_id: numOrNull(row.area_id),
    area: String(row.area ?? ''),
    school_id: numOrNull(row.school_id),
    school: String(row.school ?? ''),
    program_id: numOrNull(row.program_id),
    program: String(row.program ?? ''),
    role_id: numOrNull(row.role_id),
    role_name: String(row.role_name ?? ''),
    role_code: row.role_code ? String(row.role_code) : undefined,
    status: st === 'inactive' ? 'inactive' : 'active',
    manager_id: numOrNull(row.manager_id),
    manager_name: row.manager_name ? String(row.manager_name) : null,
    manager_role_name: row.manager_role_name
      ? String(row.manager_role_name)
      : null,
    manager_document: row.manager_document
      ? String(row.manager_document)
      : null,
    can_edit:
      typeof row.can_edit === 'boolean' ? row.can_edit : undefined,
  };
}

export const PLANTA_SELECT_CLASS =
  'w-full min-w-0 max-w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

export function roleSkipsAutoVacancy(roleName: string | undefined): boolean {
  const n = (roleName ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (!n) return false;
  if (n === 'LITE' || n === 'LIDER') return true;
  return n === 'DOCENTE' || n === 'DOCENTES' || n.startsWith('DOCENTES ');
}
