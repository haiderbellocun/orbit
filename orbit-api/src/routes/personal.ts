import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import {
  getLiteRoleId,
  sqlPersonIsOrbitLite,
} from "../lib/orbitRoles";
import {
  personAllowedForSchoolScope,
  schoolScopeFromRequest,
} from "../middleware/orbitAuth";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";

const router = Router();

function coordinatorAcademicSql(
  areaAlias: string,
  hierarchyAlias: string,
  roleAlias: string
): string {
  return `(
      ${areaAlias}.name ILIKE '%ÁREA ACÁDEMICA%' OR
      ${areaAlias}.name ILIKE '%AREA ACADEMICA%' OR
      ${areaAlias}.name ILIKE '%ACÁDEMICA%' OR
      ${areaAlias}.name ILIKE '%ACADEMICA%'
    )
    AND ${hierarchyAlias}.level = 3
    AND (
      LOWER(COALESCE(${roleAlias}.category, ${roleAlias}.code, '')) LIKE '%acad%' OR
      ${roleAlias}.name ILIKE 'COORDINADOR%' OR
      ${roleAlias}.code ILIKE 'COORDINADOR%'
    )`;
}

function requirePersonalSchoolScope(
  req: Request,
  res: Response
): { schoolId: number } | null {
  const scope = schoolScopeFromRequest(req);
  if (scope == null) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return null;
  }
  return scope;
}

/** GET /personal */
router.get("/personal", async (req: Request, res: Response) => {
  try {
    const scope = requirePersonalSchoolScope(req, res);
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
    const liteRoleId = getLiteRoleId();
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const pageNum = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10));
    const limitNum = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10))
    );
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [
      `p.school_id = $1`,
      sqlPersonIsActive("p"),
      `(r.name IS NULL OR r.name NOT IN ('DOCENTES', 'DOCENTES PENSIONADOS'))`,
      `NOT (${sqlPersonIsOrbitLite("p", "r", liteRoleId)})`,
      `NOT (
        ${coordinatorAcademicSql("a", "h", "r")}
      )`,
    ];
    const values: unknown[] = [scope.schoolId];
    let i = 2;

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
         COALESCE(NULLIF(TRIM(p.edu_email), ''), NULLIF(TRIM(p.email), '')) AS email,
         p.phone,
         p.school_id,
         COALESCE(s.name, '') AS school,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status,
         COUNT(*) OVER() AS total_count
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
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
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (e) {
    console.error("GET /personal failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /personal */
router.post("/personal", async (req: Request, res: Response) => {
  try {
    const scope = requirePersonalSchoolScope(req, res);
    if (scope == null) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const document =
      typeof b.document === "string" ? b.document.trim() : "";
    const fullName =
      typeof b.full_name === "string"
        ? b.full_name.trim()
        : typeof b.fullName === "string"
          ? b.fullName.trim()
          : "";
    const email =
      typeof b.email === "string" ? b.email.trim().toLowerCase() : null;
    const phone = typeof b.phone === "string" ? b.phone.trim() : null;
    const roleIdRaw = b.role_id ?? b.roleId;
    const roleId =
      typeof roleIdRaw === "number"
        ? roleIdRaw
        : Number.parseInt(String(roleIdRaw ?? ""), 10);
    const programIdRaw = b.program_id ?? b.programId;
    let programId: number | null = null;
    if (programIdRaw != null && String(programIdRaw).trim() !== "") {
      programId =
        typeof programIdRaw === "number"
          ? programIdRaw
          : Number.parseInt(String(programIdRaw), 10);
    }

    if (!document || !fullName) {
      res.status(400).json({ error: "document y full_name son obligatorios" });
      return;
    }
    if (!Number.isFinite(roleId) || roleId <= 0) {
      res.status(400).json({ error: "role_id es obligatorio" });
      return;
    }

    const schoolT = qualifiedCoreTable(mode, "school");
    const programT = qualifiedCoreTable(mode, "program");
    const roleT = qualifiedCoreTable(mode, "role");
    const personT = qualifiedCoreTable(mode, "person");

    const schoolCheck = await pool.query(
      `SELECT id, area_id FROM ${schoolT} WHERE id = $1 AND COALESCE(is_active, true) = true`,
      [scope.schoolId]
    );
    if (schoolCheck.rows.length === 0) {
      res.status(400).json({ error: "Escuela no válida" });
      return;
    }
    const areaId = (schoolCheck.rows[0] as { area_id: number | null }).area_id;

    const roleCheck = await pool.query(
      `SELECT id, name FROM ${roleT} WHERE id = $1 AND COALESCE(is_active, true) = true`,
      [roleId]
    );
    if (roleCheck.rows.length === 0) {
      res.status(400).json({ error: "Rol no válido" });
      return;
    }
    const roleName = String((roleCheck.rows[0] as { name: string }).name ?? "");
    if (roleName === "DOCENTES" || roleName === "DOCENTES PENSIONADOS") {
      res.status(400).json({
        error: "Use el módulo Docentes para personal docente",
      });
      return;
    }

    if (programId != null && Number.isFinite(programId)) {
      const progCheck = await pool.query(
        `SELECT id FROM ${programT} WHERE id = $1 AND school_id = $2 AND COALESCE(is_active, true) = true`,
        [programId, scope.schoolId]
      );
      if (progCheck.rows.length === 0) {
        res.status(400).json({
          error: "El programa no pertenece a tu escuela",
        });
        return;
      }
    }

    const insert = await pool.query(
      `INSERT INTO ${personT} (
         document,
         full_name,
         email,
         phone,
         school_id,
         area_id,
         program_id,
         role_id,
         is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING id, document, full_name AS name, email, phone, school_id, program_id, role_id`,
      [
        document,
        fullName,
        email,
        phone,
        scope.schoolId,
        areaId,
        programId,
        roleId,
      ]
    );

    const row = insert.rows[0] as Record<string, unknown>;
    res.status(201).json({
      ...row,
      school: "",
      program: "",
      role_name: roleName,
      status: "active",
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Ya existe una persona con ese documento" });
      return;
    }
    console.error("POST /personal failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /personal/:id */
router.get("/personal/:id", async (req: Request, res: Response) => {
  try {
    const scope = requirePersonalSchoolScope(req, res);
    if (scope == null) return;

    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const prefix = mode === "core" ? "core." : "";
    const liteRoleId = getLiteRoleId();

    const result = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.full_name AS name,
         COALESCE(NULLIF(TRIM(p.edu_email), ''), NULLIF(TRIM(p.email), '')) AS email,
         p.phone,
         p.school_id,
         COALESCE(s.name, '') AS school,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
       WHERE p.id = $1
         AND p.school_id = $2
         AND ${sqlPersonIsActive("p")}
         AND (r.name IS NULL OR r.name NOT IN ('DOCENTES', 'DOCENTES PENSIONADOS'))
         AND NOT (${sqlPersonIsOrbitLite("p", "r", liteRoleId)})
         AND NOT (${coordinatorAcademicSql("a", "h", "r")})`,
      [id, scope.schoolId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const row = result.rows[0] as { school_id?: number | null };
    if (!personAllowedForSchoolScope(req, row.school_id)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error("GET /personal/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
