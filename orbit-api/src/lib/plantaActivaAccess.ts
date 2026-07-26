/**
 * Acceso acotado (reborn) para usuarios fuera del allowlist admin.
 * Base: capability `view:planta_activa` + límites de área.
 * Opcional: paneles extra (vacantes, etc.).
 *
 * - viewAreaIds `null` → puede ver toda la planta.
 * - editAreaIds → áreas cuyo personal puede gestionar (PATCH).
 */

export type PlantaActivaGrant = {
  email: string;
  /** `null` = ver todas las áreas. */
  viewAreaIds: number[] | null;
  /** Áreas que puede editar. */
  editAreaIds: number[];
  /**
   * Capabilities adicionales a `view:planta_activa`
   * (p. ej. `view:vacancies`, `vacancies:informative_panel`).
   */
  extraCapabilities?: readonly string[];
};

const GRANTS: readonly PlantaActivaGrant[] = [
  {
    email: "sara_murillofo@cun.edu.co",
    viewAreaIds: null,
    editAreaIds: [2, 3, 4, 5, 6, 7, 8],
    extraCapabilities: [
      "view:home",
      "view:vacancies",
      "vacancies:informative_panel",
      "view:news",
    ],
  },
  {
    email: "leidy_bernal@cun.edu.co",
    viewAreaIds: [1],
    editAreaIds: [1],
    extraCapabilities: ["view:academic_load", "view:news"],
  },
  {
    email: "tania_rocha@cun.edu.co",
    viewAreaIds: [9],
    editAreaIds: [9],
    extraCapabilities: ["view:academic_load", "view:news"],
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
  if (areaId == null || !Number.isFinite(areaId)) return false;
  return grant.editAreaIds.includes(areaId);
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
