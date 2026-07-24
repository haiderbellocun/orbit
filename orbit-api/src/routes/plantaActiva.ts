import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import {
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import { schoolScopeFromRequest } from "../middleware/orbitAuth";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";

const router = Router();

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBoolFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** GET /planta-activa — todas las personas activas (is_active). */
router.get("/planta-activa", async (req: Request, res: Response) => {
  try {
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
    const areaId = parsePositiveInt(req.query.area_id ?? req.query.areaId);
    const schoolId = parsePositiveInt(req.query.school_id ?? req.query.schoolId);
    const programId = parsePositiveInt(
      req.query.program_id ?? req.query.programId
    );
    const roleId = parsePositiveInt(req.query.role_id ?? req.query.roleId);
    const withoutSchool = parseBoolFlag(req.query.without_school);
    const withoutProgram = parseBoolFlag(req.query.without_program);
    const withoutRole = parseBoolFlag(req.query.without_role);
    const withoutEduEmail = parseBoolFlag(req.query.without_edu_email);

    const pageNum = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? "1"), 10) || 1
    );
    const limitNum = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const offset = (pageNum - 1) * limitNum;

    const schoolScope = schoolScopeFromRequest(req);
    const conditions: string[] = [sqlPersonIsActive("p")];
    const values: unknown[] = [];
    let i = 1;

    if (schoolScope != null) {
      conditions.push(`p.school_id = $${i}`);
      values.push(schoolScope.schoolId);
      i++;
    } else if (schoolId != null) {
      conditions.push(`p.school_id = $${i}`);
      values.push(schoolId);
      i++;
    }

    if (areaId != null) {
      conditions.push(`COALESCE(p.area_id, s.area_id) = $${i}`);
      values.push(areaId);
      i++;
    }

    if (programId != null) {
      conditions.push(`p.program_id = $${i}`);
      values.push(programId);
      i++;
    }

    if (roleId != null) {
      conditions.push(`p.role_id = $${i}`);
      values.push(roleId);
      i++;
    }

    if (withoutSchool) {
      conditions.push(`p.school_id IS NULL`);
    }
    if (withoutProgram) {
      conditions.push(`p.program_id IS NULL`);
    }
    if (withoutRole) {
      conditions.push(`p.role_id IS NULL`);
    }
    if (withoutEduEmail) {
      conditions.push(
        `(p.edu_email IS NULL OR TRIM(p.edu_email) = '')`
      );
    }

    if (search) {
      conditions.push(
        `(p.full_name ILIKE $${i}
          OR p.document ILIKE $${i}
          OR COALESCE(p.email, '') ILIKE $${i}
          OR COALESCE(p.edu_email, '') ILIKE $${i})`
      );
      values.push(`%${search}%`);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.area_id,
         COALESCE(a.name, '') AS area,
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
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
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
    console.error("GET /planta-activa failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /planta-activa/:id */
router.get("/planta-activa/:id", async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const schoolScope = schoolScopeFromRequest(req);

    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.address,
         p.area_id,
         COALESCE(a.name, '') AS area,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       WHERE p.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const row = rows[0] as Record<string, unknown>;
    if (
      schoolScope != null &&
      (row.school_id == null || Number(row.school_id) !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    res.json(row);
  } catch (e) {
    console.error("GET /planta-activa/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /planta-activa/:id — datos generales. */
router.patch("/planta-activa/:id", async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const schoolScope = schoolScopeFromRequest(req);

    const existing = await pool.query(
      `SELECT id, school_id, document FROM ${prefix}person WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const current = existing.rows[0] as {
      school_id: number | null;
      document: string | null;
    };
    if (
      schoolScope != null &&
      (current.school_id == null ||
        Number(current.school_id) !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const fullName =
      typeof b.full_name === "string"
        ? b.full_name.trim()
        : typeof b.fullName === "string"
          ? b.fullName.trim()
          : null;
    if (fullName != null) {
      if (!fullName) {
        res.status(400).json({ error: "full_name no puede estar vacío" });
        return;
      }
      sets.push(`full_name = $${i}`);
      values.push(fullName);
      i++;
    }

    if ("email" in b || "personal_email" in b) {
      const raw = b.email ?? b.personal_email;
      const email =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim().toLowerCase()
          : null;
      sets.push(`email = $${i}`);
      values.push(email);
      i++;
    }

    if ("edu_email" in b) {
      const raw = b.edu_email;
      const edu =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim().toLowerCase()
          : null;
      sets.push(`edu_email = $${i}`);
      values.push(edu);
      i++;
    }

    if ("phone" in b) {
      const phone =
        typeof b.phone === "string" && b.phone.trim() !== ""
          ? b.phone.trim()
          : null;
      sets.push(`phone = $${i}`);
      values.push(phone);
      i++;
    }

    if ("address" in b) {
      const address =
        typeof b.address === "string" && b.address.trim() !== ""
          ? b.address.trim()
          : null;
      sets.push(`address = $${i}`);
      values.push(address);
      i++;
    }

    const docIncoming =
      typeof b.document === "string" ? b.document.trim() : null;
    if (docIncoming != null && docIncoming !== "") {
      const currentDoc = String(current.document ?? "").trim();
      if (currentDoc === "") {
        sets.push(`document = $${i}`);
        values.push(docIncoming);
        i++;
      }
    }

    for (const [key, col] of [
      ["area_id", "area_id"],
      ["areaId", "area_id"],
      ["school_id", "school_id"],
      ["schoolId", "school_id"],
      ["program_id", "program_id"],
      ["programId", "program_id"],
      ["role_id", "role_id"],
      ["roleId", "role_id"],
    ] as const) {
      if (!(key in b)) continue;
      if (sets.some((s) => s.startsWith(`${col} =`))) continue;
      const n = parsePositiveInt(b[key]);
      sets.push(`${col} = $${i}`);
      values.push(n);
      i++;
    }

    if ("is_active" in b) {
      const active =
        typeof b.is_active === "boolean"
          ? b.is_active
          : parseBoolFlag(b.is_active);
      sets.push(`is_active = $${i}`);
      values.push(active);
      i++;
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No hay campos para actualizar" });
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await pool.query(
      `UPDATE ${prefix}person SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );

    const detail = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.address,
         p.area_id,
         COALESCE(a.name, '') AS area,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       WHERE p.id = $1`,
      [id]
    );

    res.json(detail.rows[0]);
  } catch (e) {
    console.error("PATCH /planta-activa/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
