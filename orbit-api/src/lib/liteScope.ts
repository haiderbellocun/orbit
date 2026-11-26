/**
 * Alcance por equipo (LITE y coordinadores académicos): cada usuario ve y
 * edita solo a las personas que cuelgan de él en Planta Activa (organigrama +
 * overrides de Planta, el mismo árbol que pinta la rueda).
 *
 * - LITE: su equipo directo (un nivel).
 * - Coordinador académico: todo su subárbol (sus LITE y los docentes de ellos).
 *
 * El equipo se resuelve una vez por petición (`orbitTeamScopeMiddleware`) y
 * queda en `req.orbitUser.teamPersonIds`.
 */

import type { NextFunction, Request, Response } from "express";
import { loadResponsibleIndex } from "./orgResponsible";

function normalizeRoleLabel(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Rol LITE / LIDER por nombre o código. No usa `ORBIT_LITE_ROLE_ID`: su valor
 * por defecto (9) es el perfil de operaciones, no LITE.
 */
export function isLitePersonRole(input: {
  roleCode: string | null | undefined;
  roleName: string | null | undefined;
}): boolean {
  const labels = [normalizeRoleLabel(input.roleName), normalizeRoleLabel(input.roleCode)];
  return labels.some((l) => l === "LITE" || l === "LIDER");
}

/**
 * Coordinadores de escuela académica y de especializaciones.
 * Override: ORBIT_ACADEMIC_COORDINATOR_ROLE_IDS=58,204,...
 */
const DEFAULT_ACADEMIC_COORDINATOR_ROLE_IDS = [58, 204, 205, 206, 207, 208];

export function getAcademicCoordinatorRoleIds(): number[] {
  const raw = (process.env.ORBIT_ACADEMIC_COORDINATOR_ROLE_IDS ?? "").trim();
  if (!raw) return [...DEFAULT_ACADEMIC_COORDINATOR_ROLE_IDS];
  const ids = raw
    .split(/[,;\s]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? [...new Set(ids)] : [...DEFAULT_ACADEMIC_COORDINATOR_ROLE_IDS];
}

export function isAcademicCoordinatorRoleId(roleId: number | null | undefined): boolean {
  if (roleId == null || !Number.isFinite(Number(roleId))) return false;
  return getAcademicCoordinatorRoleIds().includes(Number(roleId));
}

/** Usuario con datos recortados a su equipo (LITE o coordinador). */
export function isTeamScopedRequest(req: Request): boolean {
  const a = req.orbitUser?.orbitAccess;
  return a === "lite" || a === "coordinator";
}

/** Árbol del equipo: ids (sin incluir la raíz) y aristas padre → hijo. */
export type TeamTree = {
  personIds: number[];
  edges: Array<{ parent: number; child: number }>;
};

/** Recorre el organigrama desde `rootId` hasta `maxDepth` niveles. */
export async function loadTeamTree(rootId: number, maxDepth: number): Promise<TeamTree> {
  const index = await loadResponsibleIndex();
  const ids = new Set<number>();
  const edges: TeamTree["edges"] = [];
  if (!index) return { personIds: [], edges };
  let frontier = [rootId];
  const visited = new Set<number>([rootId]);
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: number[] = [];
    for (const parent of frontier) {
      for (const child of index.childrenOf.get(parent) ?? []) {
        if (child === rootId) continue;
        edges.push({ parent, child });
        ids.add(child);
        if (!visited.has(child)) {
          visited.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return { personIds: [...ids], edges };
}

function teamDepthFor(req: Request): number | null {
  const a = req.orbitUser?.orbitAccess;
  if (a === "lite") return 1;
  if (a === "coordinator") return Number.POSITIVE_INFINITY;
  return null;
}

/** Carga el equipo del usuario en `req.orbitUser.teamPersonIds`. */
export async function orbitTeamScopeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const u = req.orbitUser;
  const depth = teamDepthFor(req);
  if (!u || depth == null) {
    next();
    return;
  }
  try {
    const tree =
      Number.isFinite(u.personId) && u.personId > 0
        ? await loadTeamTree(u.personId, depth)
        : { personIds: [], edges: [] };
    u.teamPersonIds = tree.personIds;
    next();
  } catch (e) {
    console.error("orbitTeamScopeMiddleware failed:", e);
    res.status(500).json({ error: "No se pudo resolver tu equipo" });
  }
}

/**
 * Ids de personas del equipo del usuario autenticado.
 * `null` = el usuario no tiene recorte por equipo. `[]` = equipo vacío.
 */
export async function teamPersonIds(req: Request): Promise<number[] | null> {
  if (!isTeamScopedRequest(req)) return null;
  return req.orbitUser?.teamPersonIds ?? [];
}

/** `true` si el usuario no tiene recorte por equipo o la persona es de su equipo. */
export async function personInTeamScope(
  req: Request,
  personId: number | null | undefined
): Promise<boolean> {
  const team = await teamPersonIds(req);
  if (team == null) return true;
  if (personId == null || !Number.isFinite(Number(personId))) return false;
  return team.includes(Number(personId));
}

/** Profundidad del árbol de Planta del usuario (1 = LITE). */
export function teamTreeDepth(req: Request): number {
  return teamDepthFor(req) ?? 1;
}
