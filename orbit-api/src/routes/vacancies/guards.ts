import type { NextFunction, Request, RequestHandler, Response } from "express";
import { pool } from "../../db/connection";
import {
  schoolScopeFromRequest,
  vacancyAllowedForSchoolScope,
} from "../../middleware/orbitAuth";
import {
  canAccessVacancyInformativePanel,
  canVacancyAdmin,
} from "../../lib/orbitCapabilities";
import { resolveCoreSchemaMode, type CoreSchemaMode } from "../../lib/coreSchema";
import { coreTables, type CoreTables } from "../../lib/vacancies/repository";
import { CORE_CATALOG_UNAVAILABLE_MESSAGE } from "../../lib/vacancies/rules";

/**
 * Envuelve un handler async: cualquier excepción se registra con la etiqueta de
 * la ruta y responde 500, en vez de repetir el mismo try/catch en cada endpoint.
 */
export function route(label: string, handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch((e: unknown) => {
      console.error(`${label} failed:`, e);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
}

export function denyUnlessVacancyInformativePanel(
  req: Request,
  res: Response
): boolean {
  const u = req.orbitUser;
  if (u == null || !canAccessVacancyInformativePanel(u.capabilities)) {
    res.status(403).json({ error: "No tienes permiso para esta acción" });
    return true;
  }
  return false;
}

export function denyUnlessVacancyAdmin(req: Request, res: Response): boolean {
  const u = req.orbitUser;
  if (u == null || !canVacancyAdmin(u.capabilities, u.email)) {
    res.status(403).json({ error: "No tienes permiso para esta acción" });
    return true;
  }
  return false;
}

export async function denyIfVacancyOutOfSchoolScope(
  req: Request,
  res: Response,
  vacancyId: string
): Promise<boolean> {
  if (schoolScopeFromRequest(req) == null) return false;
  const r = await pool.query(
    `SELECT school_id FROM vacancies.vacancy WHERE id = $1`,
    [vacancyId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return true;
  }
  const sid = (r.rows[0] as { school_id: number | null }).school_id;
  if (!vacancyAllowedForSchoolScope(req, sid)) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return true;
  }
  return false;
}

/**
 * Resuelve el catálogo CORE, respondiendo 503 cuando no está disponible.
 * Devuelve `null` si ya respondió.
 */
export async function requireCoreSchema(
  res: Response
): Promise<{ mode: CoreSchemaMode; tables: CoreTables } | null> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) {
    res.status(503).json({ error: CORE_CATALOG_UNAVAILABLE_MESSAGE });
    return null;
  }
  return { mode, tables: coreTables(mode) };
}
