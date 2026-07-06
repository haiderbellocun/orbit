import type { Request } from "express";

/** Usuario coordinador de escuela: datos limitados a `person.school_id` del login. */
export function schoolScopeFromRequest(
  req: Request
): { schoolId: number } | null {
  const u = req.orbitUser;
  if (!u || u.orbitAccess !== "school") return null;
  if (u.schoolId == null || !Number.isFinite(u.schoolId)) return null;
  return { schoolId: u.schoolId };
}

export function vacancyAllowedForSchoolScope(
  req: Request,
  vacancySchoolId: number | null | undefined
): boolean {
  const scope = schoolScopeFromRequest(req);
  if (scope == null) return true;
  if (vacancySchoolId == null || !Number.isFinite(Number(vacancySchoolId))) {
    return false;
  }
  return Number(vacancySchoolId) === scope.schoolId;
}

export function personAllowedForSchoolScope(
  req: Request,
  personSchoolId: number | null | undefined
): boolean {
  const scope = schoolScopeFromRequest(req);
  if (scope == null) return true;
  if (personSchoolId == null || !Number.isFinite(Number(personSchoolId))) {
    return false;
  }
  return Number(personSchoolId) === scope.schoolId;
}
