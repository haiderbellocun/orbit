import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

type CoreSchemaMode = "public" | "core";

async function resolveCoreSchemaMode(): Promise<CoreSchemaMode | null> {
  const preferred = (process.env.DB_SCHEMA ?? "").trim().toLowerCase();
  const result = await pool.query(
    `SELECT
       to_regclass('public.school') AS school_public,
       to_regclass('core.school') AS school_core,
       to_regclass('public.program') AS program_public,
       to_regclass('core.program') AS program_core`
  );
  const row = result.rows[0] as
    | {
        school_public?: string | null;
        school_core?: string | null;
        program_public?: string | null;
        program_core?: string | null;
      }
    | undefined;
  if (preferred === "core" && row?.school_core && row?.program_core) return "core";
  if (row?.school_public && row?.program_public) return "public";
  if (row?.school_core && row?.program_core) return "core";
  return null;
}

router.get("/catalog/schools", async (_req, res) => {
  try {
    const coreMode = await resolveCoreSchemaMode();
    if (coreMode == null) {
      res.json([]);
      return;
    }
    const prefix = coreMode === "core" ? "core." : "";
    const { rows } = await pool.query(
      `SELECT id, name
       FROM ${prefix}school
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /catalog/schools failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/catalog/programs", async (req, res) => {
  try {
    const coreMode = await resolveCoreSchemaMode();
    if (coreMode == null) {
      res.json([]);
      return;
    }
    const prefix = coreMode === "core" ? "core." : "";
    const schoolIdRaw = typeof req.query.school_id === "string" ? req.query.school_id.trim() : "";
    const schoolId = schoolIdRaw ? Number.parseInt(schoolIdRaw, 10) : null;
    if (schoolIdRaw && (schoolId == null || Number.isNaN(schoolId))) {
      res.status(400).json({ error: "Invalid school_id" });
      return;
    }

    const values: unknown[] = [];
    const conditions: string[] = [`COALESCE(is_active, true) = true`];
    if (schoolId != null) {
      conditions.push(`school_id = $1`);
      values.push(schoolId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT id, name, school_id
       FROM ${prefix}program
       ${where}
       ORDER BY name ASC`,
      values
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /catalog/programs failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

