import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import { resolveCoreSchemaMode } from "../lib/coreSchema";
import {
  hasCapability,
  ORBIT_CAPABILITY,
} from "../lib/orbitCapabilities";
import {
  newsScopeFromRequest,
  newsScopeSql,
  type NewsScope,
} from "../lib/newsScope";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";

const router = Router();

/** Selector de personas para Novedades: school / área(s) / full. */
function requireNewsPersonListScope(
  req: Request,
  res: Response
): NewsScope | null {
  const caps = req.orbitUser?.capabilities;
  if (!hasCapability(caps, ORBIT_CAPABILITY.NEWS)) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return null;
  }
  const scope = newsScopeFromRequest(req);
  if (scope == null) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return null;
  }
  return scope;
}

/** GET /personal — selector de personas para Novedades. */
router.get("/personal", async (req: Request, res: Response) => {
  try {
    const scope = requireNewsPersonListScope(req, res);
    if (scope == null) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      return;
    }

    const prefix = mode === "core" ? "core." : "";
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const pageNum = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10));
    const limitNum = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10))
    );
    const offset = (pageNum - 1) * limitNum;

    const scopePart = newsScopeSql(scope, "p", "s", 1);
    const conditions: string[] = [
      `(${scopePart.clause})`,
      sqlPersonIsActive("p"),
    ];
    const values: unknown[] = [...scopePart.values];
    let i = scopePart.nextIdx;

    if (search) {
      conditions.push(
        `(p.full_name ILIKE $${i} OR p.document ILIKE $${i} OR COALESCE(p.email, p.edu_email, '') ILIKE $${i})`
      );
      values.push(`%${search}%`);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status,
         COUNT(*) OVER() AS total_count
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       ${where}
       ORDER BY p.full_name ASC NULLS LAST
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limitNum, offset]
    );

    const total =
      result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    const data = result.rows.map((row: Record<string, unknown>) => {
      const { total_count: _tc, ...rest } = row;
      return rest;
    });

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 0,
      },
    });
  } catch (e) {
    console.error("GET /personal failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
