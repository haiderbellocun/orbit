/**
 * Acceso acotado a Planta Activa (reborn).
 * No son admin total: solo capability `view:planta_activa` + límites de área.
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
};

const GRANTS: readonly PlantaActivaGrant[] = [
  {
    email: "sara_murillofo@cun.edu.co",
    viewAreaIds: null,
    editAreaIds: [2, 3, 4, 5, 6, 7, 8],
  },
  {
    email: "leidy_bernal@cun.edu.co",
    viewAreaIds: [1],
    editAreaIds: [1],
  },
  {
    email: "tania_rocha@cun.edu.co",
    viewAreaIds: [9],
    editAreaIds: [9],
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
  if (grant == null) return true; // admin / sin grant (otro middleware)
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

/** Lista fija de grants (útil en tests / docs). */
export function listPlantaActivaGrants(): readonly PlantaActivaGrant[] {
  return GRANTS;
}
