import type { Request } from "express";
import { schoolScopeFromRequest } from "./schoolScope";

export type NewsScope =
  | { kind: "full" }
  | { kind: "school"; schoolId: number }
  | { kind: "area"; areaId: number }
  /** Varias áreas (grants Planta Activa: Leidy, Tania, etc.). */
  | { kind: "areas"; areaIds: number[] };

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
 * - school → escuela del coordinador
 * - areas → grant Planta con `plantaViewAreaIds` acotados (Leidy/Tania)
 * - area → área del coordinador (roles en ORBIT_NEWS_AREA_ROLE_IDS)
 * - full → admin allowlist o grant con vista de todas las áreas (Sara)
 */
export function newsScopeFromRequest(req: Request): NewsScope | null {
  const u = req.orbitUser;
  if (!u) return null;

  const schoolScope = schoolScopeFromRequest(req);
  if (schoolScope != null) {
    return { kind: "school", schoolId: schoolScope.schoolId };
  }

  // Grants Planta: recorte por área(s) antes de tratar orbitAccess "full".
  const viewAreas = u.plantaViewAreaIds;
  if (Array.isArray(viewAreas) && viewAreas.length > 0) {
    const areaIds = [
      ...new Set(
        viewAreas.filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];
    if (areaIds.length === 1) {
      return { kind: "area", areaId: areaIds[0] };
    }
    if (areaIds.length > 1) {
      return { kind: "areas", areaIds };
    }
  }

  const areaId = areaIdFromRequest(req);
  if (areaId != null && isNewsAreaRoleId(u.roleId)) {
    return { kind: "area", areaId };
  }

  // Sara (viewAreaIds null) y allowlist admin.
  if (u.orbitAccess === "full") {
    return { kind: "full" };
  }

  return null;
}

/** SQL de alcance sobre persona (`aliasAp`) + escuela (`aliasS`). */
export function newsScopeSql(
  scope: NewsScope,
  aliasAp: string,
  aliasS: string,
  startIdx: number
): { clause: string; values: unknown[]; nextIdx: number } {
  if (scope.kind === "school") {
    return {
      clause: `${aliasAp}.school_id = $${startIdx}`,
      values: [scope.schoolId],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.kind === "area") {
    return {
      clause: `COALESCE(${aliasAp}.area_id, ${aliasS}.area_id) = $${startIdx}`,
      values: [scope.areaId],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.kind === "areas") {
    return {
      clause: `COALESCE(${aliasAp}.area_id, ${aliasS}.area_id) = ANY($${startIdx}::int[])`,
      values: [scope.areaIds],
      nextIdx: startIdx + 1,
    };
  }
  return { clause: "TRUE", values: [], nextIdx: startIdx };
}
