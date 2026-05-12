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
  return /^coord/i.test(n) || /^coord/i.test(c);
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
