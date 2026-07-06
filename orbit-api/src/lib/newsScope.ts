import type { Request } from "express";
import { schoolScopeFromRequest } from "./schoolScope";

export type NewsScope =
  | { kind: "full" }
  | { kind: "school"; schoolId: number }
  | { kind: "area"; areaId: number };

/** Roles con novedades filtradas por `person.area_id` / escuelas del área (JWT `areaId`). */
export function getNewsAreaRoleIds(): number[] {
  const raw = (process.env.ORBIT_NEWS_AREA_ROLE_IDS ?? "").trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
}

export function isNewsAreaRoleId(roleId: number | null | undefined): boolean {
  if (roleId == null || !Number.isFinite(roleId)) return false;
  return getNewsAreaRoleIds().includes(roleId);
}

export function areaIdFromRequest(req: Request): number | null {
  const u = req.orbitUser;
  if (!u) return null;
  const aid = (u as { areaId?: number | null }).areaId;
  if (aid == null || !Number.isFinite(aid) || aid <= 0) return null;
  return aid;
}

/**
 * Alcance de novedades según JWT. Requiere `view:news` (validar en ruta).
 * - full → sin filtro obligatorio
 * - school → escuela del coordinador
 * - area → área del coordinador (roles en ORBIT_NEWS_AREA_ROLE_IDS)
 */
export function newsScopeFromRequest(req: Request): NewsScope | null {
  const u = req.orbitUser;
  if (!u) return null;

  const schoolScope = schoolScopeFromRequest(req);
  if (schoolScope != null) {
    return { kind: "school", schoolId: schoolScope.schoolId };
  }

  const areaId = areaIdFromRequest(req);
  if (areaId != null && isNewsAreaRoleId(u.roleId)) {
    return { kind: "area", areaId };
  }

  if (u.orbitAccess === "full") {
    return { kind: "full" };
  }

  return null;
}
