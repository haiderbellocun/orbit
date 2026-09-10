/**
 * Acceso acotado a Planta Activa (espejo del API).
 * Fuente de verdad en login: `orbit_user.plantaActivaAccess`.
 * Este mapa cubre UI antes de re-login / fallback.
 */

export type PlantaActivaAccess = {
  /** `null` = ver todas las áreas. */
  viewAreaIds: number[] | null;
  /** `null` = editar cualquier área (admin). Array = solo esas áreas. */
  editAreaIds: number[] | null;
  /** La API limita la vista a jefes, persona y descendientes. */
  hierarchyScoped?: boolean;
  /** Puede editar las personas devueltas por su alcance jerárquico. */
  canEditHierarchy?: boolean;
  /** Oculta LITE/LIDER y DOCENTE/DOCENTES en listados. */
  excludeLiteAndDocenteRoles?: boolean;
};

/** Ven y editan toda la planta activa, incluidas áreas LITE/DOCENTE. */
const SARA_LEVEL_ACCESS: PlantaActivaAccess = {
  viewAreaIds: null,
  editAreaIds: null,
};

/** OPERACION ACADEMICA (1) + ESPECIALIZACIONES (9). Sin recorte de LITE/DOCENTE. */
const RAUL_ANALYST_ACCESS: PlantaActivaAccess = {
  viewAreaIds: [1, 9],
  editAreaIds: [1, 9],
};

const HIERARCHY_VIEW_ONLY_ACCESS: PlantaActivaAccess = {
  viewAreaIds: [],
  editAreaIds: [],
  hierarchyScoped: true,
  canEditHierarchy: true,
};

const GRANTS: Readonly<Record<string, PlantaActivaAccess>> = {
  "sara_murillofo@cun.edu.co": SARA_LEVEL_ACCESS,
  "cindy_russi@cun.edu.co": SARA_LEVEL_ACCESS,
  "leidy_bernal@cun.edu.co": {
    viewAreaIds: [1],
    editAreaIds: [1],
    hierarchyScoped: true,
    canEditHierarchy: true,
  },
  "carlos_rodriguezs@cun.edu.co": {
    viewAreaIds: [1],
    editAreaIds: [1],
    hierarchyScoped: true,
    canEditHierarchy: true,
  },
  "tania_rocha@cun.edu.co": {
    viewAreaIds: [9],
    editAreaIds: [9],
    hierarchyScoped: true,
    canEditHierarchy: true,
  },
  "viviana_cabrerac@cun.edu.co": HIERARCHY_VIEW_ONLY_ACCESS,
  "aura_royero@cun.edu.co": HIERARCHY_VIEW_ONLY_ACCESS,
  "andres_prieto@cun.edu.co": HIERARCHY_VIEW_ONLY_ACCESS,
  "maira_doncel@cun.edu.co": HIERARCHY_VIEW_ONLY_ACCESS,
  "katherinn_devia@cun.edu.co": RAUL_ANALYST_ACCESS,
  "leidy_diazgranados@cun.edu.co": RAUL_ANALYST_ACCESS,
  "lidy_alonso@cun.edu.co": RAUL_ANALYST_ACCESS,
  "monica_pachon@cun.edu.co": RAUL_ANALYST_ACCESS,
};

function normEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function isLiteOrDocenteRoleName(roleName: string | undefined): boolean {
  const n = normalizeRoleLabel(roleName);
  if (!n) return false;
  if (n === "LITE" || n === "LIDER") return true;
  return n === "DOCENTE" || n === "DOCENTES" || n.startsWith("DOCENTES ");
}

export function getPlantaActivaGrantByEmail(
  email: string | null | undefined
): PlantaActivaAccess | null {
  const e = normEmail(email);
  if (!e) return null;
  return GRANTS[e] ?? null;
}

export function shouldExcludeLiteAndDocenteFromPlantaView(
  access: PlantaActivaAccess | null | undefined
): boolean {
  return access?.excludeLiteAndDocenteRoles === true;
}

export function canEditPlantaPersonArea(
  access: PlantaActivaAccess | null | undefined,
  areaId: number | null | undefined,
  roleName?: string | null
): boolean {
  if (access == null || access.editAreaIds == null) return true;
  if (areaId == null || !Number.isFinite(areaId)) return false;
  if (!access.editAreaIds.includes(areaId)) return false;
  if (
    shouldExcludeLiteAndDocenteFromPlantaView(access) &&
    isLiteOrDocenteRoleName(roleName ?? undefined)
  ) {
    return false;
  }
  return true;
}
