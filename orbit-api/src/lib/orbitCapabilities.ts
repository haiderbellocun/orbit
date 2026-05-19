/**
 * Capacidades ORBIT (vistas y APIs). Lista cerrada de roles autorizados.
 */

import { getLiteRoleId } from "./orbitRoles";

export type OrbitAccess = "lite" | "full" | "school";

export const ORBIT_CAPABILITY = {
  HOME: "view:home",
  TEACHERS: "view:teachers",
  ACADEMIC_LOAD: "view:academic_load",
  COORDINATORS: "view:coordinators",
  LITES: "view:lites",
  VACANCIES: "view:vacancies",
} as const;

export type OrbitCapability =
  (typeof ORBIT_CAPABILITY)[keyof typeof ORBIT_CAPABILITY];

export const ALL_ORBIT_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.HOME,
  ORBIT_CAPABILITY.TEACHERS,
  ORBIT_CAPABILITY.ACADEMIC_LOAD,
  ORBIT_CAPABILITY.COORDINATORS,
  ORBIT_CAPABILITY.LITES,
  ORBIT_CAPABILITY.VACANCIES,
];

const LITE_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.HOME,
  ORBIT_CAPABILITY.TEACHERS,
];

const DEFAULT_FULL_ACCESS_ROLE_IDS = [1, 10, 13, 19, 42, 43, 44, 45, 46];

/**
 * Rol 9: todos los paneles ORBIT + datos sin filtro LITE (`orbitAccess: "full"`).
 */
export const ROLE_9_OPERATIONS_CAPABILITIES: readonly OrbitCapability[] =
  ALL_ORBIT_CAPABILITIES;

/** Solo panel Vacantes (y detalle / reintegros asociados en UI). */
export const VACANCIES_ONLY_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.VACANCIES,
];

/** Coordinadores de escuela: todos los paneles, datos filtrados por `person.school_id`. */
export const SCHOOL_COORDINATOR_ROLE_IDS: readonly number[] = [4, 5, 6, 7, 8, 11];

function isSchoolCoordinatorRoleId(roleId: number): boolean {
  return SCHOOL_COORDINATOR_ROLE_IDS.includes(roleId);
}

/** Perfiles parciales: role_id → capabilities (tiene prioridad sobre perfil LITE por id). */
const ROLE_CAPABILITY_MAP: Readonly<Record<number, readonly OrbitCapability[]>> = {
  9: ROLE_9_OPERATIONS_CAPABILITIES,
  37: VACANCIES_ONLY_CAPABILITIES,
  38: VACANCIES_ONLY_CAPABILITIES,
};

export function getFullAccessRoleIds(): number[] {
  const raw = (process.env.ORBIT_FULL_ACCESS_ROLE_IDS ?? "").trim();
  if (!raw) return [...DEFAULT_FULL_ACCESS_ROLE_IDS];
  const ids = raw
    .split(/[,;\s]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return ids.length > 0 ? [...new Set(ids)] : [...DEFAULT_FULL_ACCESS_ROLE_IDS];
}

function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function isOrbitLiteRole(input: {
  roleId: number | null;
  roleCode: string | null;
  roleName: string | null;
}): boolean {
  const roleId = input.roleId;
  if (roleId != null && roleId === getLiteRoleId()) return true;

  const nameNorm = normalizeRoleLabel(input.roleName);
  const codeNorm = normalizeRoleLabel(input.roleCode);
  if (nameNorm === "LITE" || codeNorm === "LITE") return true;
  if (nameNorm === "LIDER" || codeNorm === "LIDER") return true;
  return false;
}

export type ResolvedOrbitAccess = {
  orbitAccess: OrbitAccess;
  capabilities: OrbitCapability[];
};

/**
 * Resuelve acceso ORBIT por `role_id` (lista cerrada). `null` = no autorizado.
 */
export function resolveOrbitAccess(input: {
  roleId: number | null;
  roleCode: string | null;
  roleName: string | null;
}): ResolvedOrbitAccess | null {
  const roleId = input.roleId;

  if (roleId != null && Number.isFinite(roleId)) {
    const fullIds = getFullAccessRoleIds();
    if (fullIds.includes(roleId)) {
      return {
        orbitAccess: "full",
        capabilities: [...ALL_ORBIT_CAPABILITIES],
      };
    }

    if (isSchoolCoordinatorRoleId(roleId)) {
      return {
        orbitAccess: "school",
        capabilities: [...ALL_ORBIT_CAPABILITIES],
      };
    }

    const custom = ROLE_CAPABILITY_MAP[roleId];
    if (custom && custom.length > 0) {
      return {
        orbitAccess: "full",
        capabilities: [...new Set(custom)] as OrbitCapability[],
      };
    }
  }

  if (isOrbitLiteRole(input)) {
    return {
      orbitAccess: "lite",
      capabilities: [...LITE_CAPABILITIES],
    };
  }

  return null;
}

export function hasCapability(
  capabilities: readonly string[] | undefined,
  required: OrbitCapability
): boolean {
  if (!capabilities || capabilities.length === 0) return false;
  return capabilities.includes(required);
}
