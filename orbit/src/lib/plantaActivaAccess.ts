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
};

const SARA_LEVEL_ACCESS: PlantaActivaAccess = {
  viewAreaIds: null,
  editAreaIds: [2, 3, 4, 5, 6, 7, 8],
};

const GRANTS: Readonly<Record<string, PlantaActivaAccess>> = {
  "sara_murillofo@cun.edu.co": SARA_LEVEL_ACCESS,
  "cindy_russi@cun.edu.co": SARA_LEVEL_ACCESS,
  "leidy_bernal@cun.edu.co": {
    viewAreaIds: [1],
    editAreaIds: [1],
  },
  "tania_rocha@cun.edu.co": {
    viewAreaIds: [9],
    editAreaIds: [9],
  },
};

function normEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getPlantaActivaGrantByEmail(
  email: string | null | undefined
): PlantaActivaAccess | null {
  const e = normEmail(email);
  if (!e) return null;
  return GRANTS[e] ?? null;
}

export function canEditPlantaPersonArea(
  access: PlantaActivaAccess | null | undefined,
  areaId: number | null | undefined
): boolean {
  if (access == null || access.editAreaIds == null) return true;
  if (areaId == null || !Number.isFinite(areaId)) return false;
  return access.editAreaIds.includes(areaId);
}
