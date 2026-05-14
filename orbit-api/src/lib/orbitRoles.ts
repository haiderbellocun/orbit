/**
 * ORBIT solo permite ciertos roles de `person` / `role`.
 */

export type OrbitAccess = "lite" | "full";

const AUXILIAR_NORM = "AUXILIAR ADMINISTRATIVO DE OPERACIONES";
const DESARROLLADOR_NORM = "DESARROLLADOR";

export function getLiteRoleId(): number {
  const n = Number.parseInt(process.env.ORBIT_LITE_ROLE_ID ?? "9", 10);
  return Number.isFinite(n) ? n : 9;
}

/**
 * Coincide con `classifyOrbitRole` (perfil LITE en ORBIT): id configurable o rol LITE/LIDER en catálogo.
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

function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function isCoordinatorLike(name: string | null, code: string | null): boolean {
  const n = (name ?? "").trim();
  const c = (code ?? "").trim();
  if (/^coord/i.test(n) || /^coord/i.test(c)) return true;
  /** Errata frecuente en catálogo: "COODINADOR…" no coincide con /^coord/. */
  if (/coodinad/i.test(n) || /coodinad/i.test(c)) return true;
  return false;
}

/**
 * Clasifica el acceso ORBIT. `null` = rol no autorizado.
 */
export function classifyOrbitRole(input: {
  roleId: number | null;
  roleCode: string | null;
  roleName: string | null;
}): OrbitAccess | null {
  const roleId = input.roleId;
  const code = input.roleCode;
  const name = input.roleName;

  if (roleId != null && roleId === getLiteRoleId()) return "lite";

  const nameNorm = normalizeRoleLabel(name);
  const codeNorm = normalizeRoleLabel(code);
  if (nameNorm === "LITE" || codeNorm === "LITE") return "lite";
  /** En Core el rol suele llamarse "LIDER" (p. ej. id 12), equivalente a perfil LITE en ORBIT. */
  if (nameNorm === "LIDER" || codeNorm === "LIDER") return "lite";

  if (isCoordinatorLike(name, code)) return "full";

  if (nameNorm === AUXILIAR_NORM || codeNorm === AUXILIAR_NORM) return "full";
  if (nameNorm === DESARROLLADOR_NORM || codeNorm === DESARROLLADOR_NORM) return "full";
  if (
    nameNorm.startsWith(`${DESARROLLADOR_NORM} `) ||
    codeNorm.startsWith(`${DESARROLLADOR_NORM} `)
  ) {
    return "full";
  }

  return null;
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
