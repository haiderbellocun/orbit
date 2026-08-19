/**
 * Helpers SQL y configuración LITE. Autorización por rol: `orbitCapabilities.ts`.
 */

export type { OrbitAccess } from "./orbitCapabilities";

export function getLiteRoleId(): number {
  const n = Number.parseInt(process.env.ORBIT_LITE_ROLE_ID ?? "9", 10);
  return Number.isFinite(n) ? n : 9;
}

function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Roles LITE / LIDER (mismo perfil Orbit LITE). */
export function isLiteOrLiderRole(input: {
  roleId: number | null;
  roleCode?: string | null;
  roleName?: string | null;
}): boolean {
  const roleId = input.roleId;
  if (roleId != null && roleId === getLiteRoleId()) return true;
  const nameNorm = normalizeRoleLabel(input.roleName);
  const codeNorm = normalizeRoleLabel(input.roleCode);
  return (
    nameNorm === "LITE" ||
    codeNorm === "LITE" ||
    nameNorm === "LIDER" ||
    codeNorm === "LIDER"
  );
}

/** Roles docentes: DOCENTE, DOCENTES, DOCENTES PENSIONADOS, etc. */
export function isDocenteRole(input: {
  roleCode?: string | null;
  roleName?: string | null;
}): boolean {
  const nameNorm = normalizeRoleLabel(input.roleName);
  const codeNorm = normalizeRoleLabel(input.roleCode);
  const labels = [nameNorm, codeNorm].filter(Boolean);
  return labels.some(
    (l) => l === "DOCENTE" || l === "DOCENTES" || l.startsWith("DOCENTES ")
  );
}

/**
 * Al inactivar persona no se auto-crea vacante para DOCENTE / LIDER / LITE.
 */
export function shouldSkipVacancyOnInactivation(input: {
  roleId: number | null;
  roleCode?: string | null;
  roleName?: string | null;
}): boolean {
  return isDocenteRole(input) || isLiteOrLiderRole(input);
}

/**
 * Coincide con `resolveOrbitAccess` (perfil LITE en ORBIT): id configurable o rol LITE/LIDER en catálogo.
 * Requiere `LEFT JOIN …role ${roleAlias} ON ${roleAlias}.id = ${personAlias}.role_id`.
 */
export function sqlPersonIsOrbitLite(
  personAlias: string,
  roleAlias: string,
  liteRoleId: number
): string {
  return `(
    ${personAlias}.role_id = ${liteRoleId}
    OR trim(upper(COALESCE(${roleAlias}.name, ''))) IN ('LITE', 'LIDER')
    OR trim(upper(COALESCE(${roleAlias}.code, ''))) IN ('LITE', 'LIDER')
  )`;
}

/** Misma lógica que `sqlPersonIsOrbitLite` sin JOIN previo a `role` (p. ej. UPDATE). */
export function sqlPersonIsOrbitLiteExists(
  personAlias: string,
  schemaPrefix: string,
  liteRoleId: number
): string {
  return `(
    ${personAlias}.role_id = ${liteRoleId}
    OR EXISTS (
      SELECT 1
      FROM ${schemaPrefix}role r_orbit_lite
      WHERE r_orbit_lite.id = ${personAlias}.role_id
        AND (
          trim(upper(COALESCE(r_orbit_lite.name, ''))) IN ('LITE', 'LIDER')
          OR trim(upper(COALESCE(r_orbit_lite.code, ''))) IN ('LITE', 'LIDER')
        )
    )
  )`;
}

export function buildLiteProgramIds(
  programId: number | null,
  programsIdArray: unknown
): number[] {
  const out = new Set<number>();
  if (programId != null && Number.isFinite(Number(programId))) {
    out.add(Number(programId));
  }
  if (Array.isArray(programsIdArray)) {
    for (const x of programsIdArray) {
      const n =
        typeof x === "number" && Number.isFinite(x)
          ? x
          : Number.parseInt(String(x), 10);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out];
}
