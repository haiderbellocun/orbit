/**
 * Capacidades ORBIT (vistas y APIs). Lista cerrada de roles autorizados.
 */

import { getLiteRoleId } from "./orbitRoles";
import { isNewsAreaRoleId } from "./newsScope";
import { isEmailOnPlantaActivaGrant } from "./plantaActivaAccess";

export type OrbitAccess = "lite" | "full" | "school";

export const ORBIT_CAPABILITY = {
  HOME: "view:home",
  ACADEMIC_LOAD: "view:academic_load",
  SUBSTANTIVE_HOURS: "view:substantive_hours",
  VACANCIES: "view:vacancies",
  /** Panel informativo de vacantes (bitácora de cambios). */
  VACANCIES_INFORMATIVE_PANEL: "vacancies:informative_panel",
  /** Administración de vacantes: eliminar y cambio de estado forzado (rol 38). */
  VACANCIES_ADMIN: "vacancies:admin",
  PLANTA_ACTIVA: "view:planta_activa",
  NEWS: "view:news",
} as const;

export type OrbitCapability =
  (typeof ORBIT_CAPABILITY)[keyof typeof ORBIT_CAPABILITY];

export const ALL_ORBIT_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.HOME,
  ORBIT_CAPABILITY.ACADEMIC_LOAD,
  ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  ORBIT_CAPABILITY.VACANCIES,
  ORBIT_CAPABILITY.NEWS,
];

/** Todas las capabilities existentes (reborn / bootstrap admin). */
export const SUPER_ADMIN_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.HOME,
  ORBIT_CAPABILITY.ACADEMIC_LOAD,
  ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  ORBIT_CAPABILITY.VACANCIES,
  ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL,
  ORBIT_CAPABILITY.VACANCIES_ADMIN,
  ORBIT_CAPABILITY.PLANTA_ACTIVA,
  ORBIT_CAPABILITY.NEWS,
];

/**
 * Allowlist temporal de acceso a ORBIT (reborn).
 * Por defecto: camilo_quintero + haider_bello (acceso total).
 * Override: ORBIT_ACCESS_ALLOWLIST=a@cun.edu.co,b@cun.edu.co
 */
const DEFAULT_ACCESS_ALLOWLIST = [
  "camilo_quintero@cun.edu.co",
  "haider_bello@cun.edu.co",
] as const;

export function getOrbitAccessAllowlist(): string[] {
  const raw = (process.env.ORBIT_ACCESS_ALLOWLIST ?? "").trim();
  if (!raw) return [...DEFAULT_ACCESS_ALLOWLIST];
  const emails = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return emails.length > 0 ? [...new Set(emails)] : [...DEFAULT_ACCESS_ALLOWLIST];
}

export function isEmailOnOrbitAllowlist(email: string | null | undefined): boolean {
  const norm = (email ?? "").trim().toLowerCase();
  if (!norm) return false;
  return getOrbitAccessAllowlist().includes(norm);
}

/**
 * Puede iniciar sesión en ORBIT: allowlist admin (acceso total) o grant de Planta Activa.
 */
export function isEmailAuthorizedForOrbit(
  email: string | null | undefined
): boolean {
  return isEmailOnOrbitAllowlist(email) || isEmailOnPlantaActivaGrant(email);
}

/** Solo Planta Activa por defecto; extras vienen del grant. */
export const PLANTA_ACTIVA_ONLY_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.PLANTA_ACTIVA,
];

export function resolvePlantaActivaGrantAccess(
  grant: { extraCapabilities?: readonly string[] } | null | undefined
): ResolvedOrbitAccess {
  const extra = (grant?.extraCapabilities ?? []).filter((c): c is OrbitCapability =>
    (Object.values(ORBIT_CAPABILITY) as string[]).includes(c)
  );
  return {
    orbitAccess: "full",
    capabilities: [
      ...new Set([...PLANTA_ACTIVA_ONLY_CAPABILITIES, ...extra]),
    ],
  };
}

const LITE_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.HOME,
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

/** Rol 37: vacantes + panel informativo (sin eliminar ni cambio de estado forzado). */
export const ROLE_37_VACANCIES_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.VACANCIES,
  ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL,
];

/** Rol con permisos administrativos sobre vacantes. */
export const VACANCY_ADMIN_ROLE_ID = 38;

export const VACANCIES_ADMIN_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.VACANCIES,
  ORBIT_CAPABILITY.VACANCIES_ADMIN,
];

/** Coordinadores de escuela: todos los paneles, datos filtrados por `person.school_id`. */
export const SCHOOL_COORDINATOR_ROLE_IDS: readonly number[] = [4, 5, 6, 7, 8, 11];

function isSchoolCoordinatorRoleId(roleId: number): boolean {
  return SCHOOL_COORDINATOR_ROLE_IDS.includes(roleId);
}

/** Rol 51: Vacantes + Novedades (alcance escuela). */
export const ROLE_51_STAFF_CAPABILITIES: readonly OrbitCapability[] = [
  ORBIT_CAPABILITY.VACANCIES,
  ORBIT_CAPABILITY.NEWS,
];

export const ROLE_51_STAFF_ROLE_ID = 51;

export function isRole51StaffRoleId(roleId: number): boolean {
  return roleId === ROLE_51_STAFF_ROLE_ID;
}

/** Perfiles parciales: role_id → capabilities (tiene prioridad sobre perfil LITE por id). */
const ROLE_CAPABILITY_MAP: Readonly<Record<number, readonly OrbitCapability[]>> = {
  9: ROLE_9_OPERATIONS_CAPABILITIES,
  37: ROLE_37_VACANCIES_CAPABILITIES,
  38: VACANCIES_ADMIN_CAPABILITIES,
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

/** Acceso total para correos en la allowlist de reborn. */
export function resolveAllowlistAdminAccess(): ResolvedOrbitAccess {
  return {
    orbitAccess: "full",
    capabilities: [...SUPER_ADMIN_CAPABILITIES],
  };
}

/**
 * Resuelve acceso ORBIT por `role_id` (lista cerrada). `null` = no autorizado.
 * Nota: en reborn el login usa allowlist; esta función queda para el modelo por roles.
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

    if (isRole51StaffRoleId(roleId)) {
      return {
        orbitAccess: "school",
        capabilities: [...ROLE_51_STAFF_CAPABILITIES],
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

function ensureNewsCapability(
  capabilities: OrbitCapability[],
  roleId: number | null
): OrbitCapability[] {
  if (roleId == null || !isNewsAreaRoleId(roleId)) return capabilities;
  if (capabilities.includes(ORBIT_CAPABILITY.NEWS)) return capabilities;
  return [...capabilities, ORBIT_CAPABILITY.NEWS];
}

export function finalizeOrbitCapabilities(
  resolved: ResolvedOrbitAccess,
  roleId: number | null
): ResolvedOrbitAccess {
  return {
    ...resolved,
    capabilities: ensureNewsCapability(resolved.capabilities, roleId),
  };
}

export function hasCapability(
  capabilities: readonly string[] | undefined,
  required: OrbitCapability
): boolean {
  if (!capabilities || capabilities.length === 0) return false;
  return capabilities.includes(required);
}

export function canAccessVacancyInformativePanel(
  capabilities: readonly string[] | undefined
): boolean {
  return (
    hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL) ||
    hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES_ADMIN)
  );
}
