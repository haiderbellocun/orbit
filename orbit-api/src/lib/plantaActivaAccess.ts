/**
 * Acceso acotado (reborn) para usuarios fuera del allowlist admin.
 * Base: capability `view:planta_activa` + límites de área.
 * Opcional: paneles extra (vacantes, etc.).
 *
 * - viewAreaIds `null` → puede ver toda la planta.
 * - editAreaIds → áreas cuyo personal puede gestionar (PATCH).
 * - excludeLiteAndDocenteRoles → oculta LITE/LIDER y DOCENTE/DOCENTES.
 */

import { isLiteOrDocenteRole } from "./orbitRoles";

export type PlantaActivaGrant = {
  email: string;
  /** `null` = ver todas las áreas. */
  viewAreaIds: number[] | null;
  /** Áreas que puede editar. `null` = todas (mismo alcance que admin). */
  editAreaIds: number[] | null;
  /** Limita Planta Activa a la linea del usuario: jefes, persona y descendientes. */
  hierarchyScoped?: boolean;
  /** Permite editar personas incluidas en el alcance jerarquico. */
  canEditHierarchy?: boolean;
  /** Para LITE: corta superiores por encima de su responsable inmediato. */
  hierarchyStartsAtManager?: boolean;
  /** Solo permite editar campos personales; bloquea estructura y asignaciones. */
  personalDataOnly?: boolean;
  /**
   * Si true, no listan ni gestionan personas con rol LITE/LIDER o DOCENTE/DOCENTES.
   * Coordinadores y demás roles sí aparecen.
   */
  excludeLiteAndDocenteRoles?: boolean;
  /**
   * Capabilities adicionales a `view:planta_activa`
   * (p. ej. `view:vacancies`, `vacancies:informative_panel`).
   */
  extraCapabilities?: readonly string[];
};

const SARA_LEVEL_EXTRAS = [
  "view:home",
  "view:vacancies",
  "vacancies:informative_panel",
  "vacancies:admin",
  "view:news",
  "roles:manage",
] as const;

/** Ven toda la planta activa (todas las áreas, todos los roles). */
const SARA_LEVEL_VIEW_AREA_IDS = null;
/** Gestionan cualquier área, incluidas las nuevas y las de personal LITE/DOCENTE. */
const SARA_LEVEL_EDIT_AREA_IDS = null;

/** OPERACION ACADEMICA (1) + ESPECIALIZACIONES (9). Sin recorte de LITE/DOCENTE. */
const RAUL_ANALYST_AREA_IDS = [1, 9];
const RAUL_ANALYST_EXTRAS = ["view:academic_load", "view:news"] as const;
const RAUL_ANALYST_GRANT = {
  viewAreaIds: RAUL_ANALYST_AREA_IDS,
  editAreaIds: RAUL_ANALYST_AREA_IDS,
  extraCapabilities: RAUL_ANALYST_EXTRAS,
} as const;

/** Coordinadores con vista de su linea; sin permisos de gestion por area. */
const HIERARCHY_VIEW_ONLY_GRANT: Omit<PlantaActivaGrant, "email"> = {
  viewAreaIds: [],
  editAreaIds: [],
  hierarchyScoped: true,
  canEditHierarchy: true,
  extraCapabilities: ["view:academic_load", "view:substantive_hours"],
};

const GRANTS: readonly PlantaActivaGrant[] = [
  {
    email: "sara_murillofo@cun.edu.co",
    viewAreaIds: SARA_LEVEL_VIEW_AREA_IDS,
    editAreaIds: SARA_LEVEL_EDIT_AREA_IDS,
    extraCapabilities: SARA_LEVEL_EXTRAS,
  },
  {
    email: "cindy_russi@cun.edu.co",
    viewAreaIds: SARA_LEVEL_VIEW_AREA_IDS,
    editAreaIds: SARA_LEVEL_EDIT_AREA_IDS,
    extraCapabilities: SARA_LEVEL_EXTRAS,
  },
  {
    email: "leidy_bernal@cun.edu.co",
    viewAreaIds: [1],
    editAreaIds: [1],
    hierarchyScoped: true,
    canEditHierarchy: true,
    extraCapabilities: ["view:academic_load", "view:substantive_hours", "view:news"],
  },
  {
    email: "carlos_rodriguezs@cun.edu.co",
    viewAreaIds: [1],
    editAreaIds: [1],
    hierarchyScoped: true,
    canEditHierarchy: true,
    extraCapabilities: ["view:academic_load", "view:substantive_hours", "view:news"],
  },
  {
    email: "tania_rocha@cun.edu.co",
    viewAreaIds: [9],
    editAreaIds: [9],
    hierarchyScoped: true,
    canEditHierarchy: true,
    extraCapabilities: ["view:academic_load", "view:substantive_hours", "view:news"],
  },
  {
    email: "viviana_cabrerac@cun.edu.co",
    ...HIERARCHY_VIEW_ONLY_GRANT,
  },
  {
    email: "aura_royero@cun.edu.co",
    ...HIERARCHY_VIEW_ONLY_GRANT,
  },
  {
    email: "andres_prieto@cun.edu.co",
    ...HIERARCHY_VIEW_ONLY_GRANT,
  },
  {
    email: "maira_doncel@cun.edu.co",
    ...HIERARCHY_VIEW_ONLY_GRANT,
  },
  {
    email: "katherinn_devia@cun.edu.co",
    ...RAUL_ANALYST_GRANT,
  },
  {
    email: "leidy_diazgranados@cun.edu.co",
    ...RAUL_ANALYST_GRANT,
  },
  {
    email: "lidy_alonso@cun.edu.co",
    ...RAUL_ANALYST_GRANT,
  },
  {
    email: "monica_pachon@cun.edu.co",
    ...RAUL_ANALYST_GRANT,
  },
];

function normEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getPlantaActivaGrant(
  email: string | null | undefined
): PlantaActivaGrant | null {
  const e = normEmail(email);
  if (!e) return null;
  return GRANTS.find((g) => g.email === e) ?? null;
}

export function isEmailOnPlantaActivaGrant(
  email: string | null | undefined
): boolean {
  return getPlantaActivaGrant(email) != null;
}

export function canViewPlantaArea(
  grant: PlantaActivaGrant | null | undefined,
  areaId: number | null
): boolean {
  if (grant == null) return true;
  if (grant.viewAreaIds == null) return true;
  if (areaId == null || !Number.isFinite(areaId)) return false;
  return grant.viewAreaIds.includes(areaId);
}

export function canEditPlantaArea(
  grant: PlantaActivaGrant | null | undefined,
  areaId: number | null
): boolean {
  if (grant == null) return true;
  if (grant.editAreaIds == null) return true;
  if (areaId == null || !Number.isFinite(areaId)) return false;
  return grant.editAreaIds.includes(areaId);
}

export function shouldExcludeLiteAndDocenteFromPlantaView(
  grant: PlantaActivaGrant | null | undefined
): boolean {
  return grant?.excludeLiteAndDocenteRoles === true;
}

export function canEditPlantaPerson(
  grant: PlantaActivaGrant | null | undefined,
  areaId: number | null,
  role?: {
    roleId?: number | null;
    roleCode?: string | null;
    roleName?: string | null;
  }
): boolean {
  if (!canEditPlantaArea(grant, areaId)) return false;
  if (
    shouldExcludeLiteAndDocenteFromPlantaView(grant) &&
    role != null &&
    isLiteOrDocenteRole(role)
  ) {
    return false;
  }
  return true;
}

/** Capabilities efectivas del grant (planta + extras). */
export function capabilitiesForPlantaActivaGrant(
  grant: PlantaActivaGrant
): string[] {
  return ["view:planta_activa", ...(grant.extraCapabilities ?? [])];
}

/** Lista fija de grants (útil en tests / docs). */
export function listPlantaActivaGrants(): readonly PlantaActivaGrant[] {
  return GRANTS;
}
