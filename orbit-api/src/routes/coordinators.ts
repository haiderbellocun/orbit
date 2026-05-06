import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

type CoreSchemaMode = "public" | "core";

async function resolveCoreSchemaMode(): Promise<CoreSchemaMode | null> {
  // Algunos entornos tienen las tablas CORE en schema `core` (core.person),
  // otros las crean en el schema del search_path (ej: public.person).
  const result = await pool.query(
    `SELECT
       to_regclass('person') AS person_public,
       to_regclass('core.person') AS person_core`
  );
  const row = result.rows[0] as
    | { person_public?: string | null; person_core?: string | null }
    | undefined;
  if (row?.person_public) return "public";
  if (row?.person_core) return "core";
  return null;
}

async function hasCorePersonTable(): Promise<boolean> {
  return (await resolveCoreSchemaMode()) != null;
}

async function hasLegacyCoordinatorsTable(): Promise<boolean> {
  const result = await pool.query(
    "SELECT to_regclass('coordinators') AS table_name"
  );
  return result.rows[0]?.table_name != null;
}

router.get("/coordinators", async (req, res) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const campus =
      typeof req.query.campus === "string" ? req.query.campus.trim() : undefined;

    const coreMode = await resolveCoreSchemaMode();
    const useCore = coreMode != null;
    const useLegacy = await hasLegacyCoordinatorsTable();

    // Si piden algo distinto a "active" en CORE, retornamos vacío (consistencia con teachers).
    if (useCore && status && status !== "active") {
      res.json([]);
      return;
    }

    if (useCore) {
      const prefix = coreMode === "core" ? "core." : "";
      const liteReg = await pool.query(`SELECT to_regclass('lites') AS lites_table`);
      const hasLites = liteReg.rows[0]?.lites_table != null;
      const conditions: string[] = [];
      const values: unknown[] = [];
      let p = 1;

      // Campus en CORE suele ser un "nombre" derivado; se filtra por area o ciudad.
      if (campus) {
        conditions.push(`(a.name ILIKE $${p} OR ci.name ILIKE $${p})`);
        values.push(`%${campus}%`);
        p++;
      }

      // Reglas de negocio:
      // - area.name = "ÁREA ACÁDEMICA" (tolerante a acentos / variaciones)
      // - hierarchy.level = 3
      // - rol académico (por category / name / code conteniendo "acad")
      conditions.push(
        `(
          a.name ILIKE '%ÁREA ACÁDEMICA%' OR
          a.name ILIKE '%AREA ACADEMICA%' OR
          a.name ILIKE '%ACÁDEMICA%' OR
          a.name ILIKE '%ACADEMICA%'
        )`
      );
      conditions.push(`h.level = 3`);
      conditions.push(
        `(
          LOWER(COALESCE(r.category, r.code, '')) LIKE '%acad%' OR
          r.name ILIKE 'COORDINADOR%' OR
          r.code ILIKE 'COORDINADOR%'
        )`
      );

      const where = `WHERE ${conditions.join(" AND ")}`;

      const litesCountExpr = hasLites
        ? `(
             SELECT COUNT(*)::int
             FROM lites l
             WHERE l.coordinator_document = p.document
           )`
        : `0::int`;

      const { rows } = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name AS name,
           COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) AS email,
           COALESCE(a.name, ci.name, '') AS campus,
           COALESCE(s.name, '') AS school,
           'active'::text AS status,
           ${litesCountExpr} AS lites_count
         FROM ${prefix}person p
         LEFT JOIN ${prefix}school s ON s.id = p.school_id
         LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
         LEFT JOIN ${prefix}city ci ON ci.id = p.city_id
         LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
         LEFT JOIN ${prefix}role r ON r.id = p.role_id
         ${where}
         ORDER BY p.full_name ASC NULLS LAST`,
        values
      );

      res.json(rows);
      return;
    }

    if (!useLegacy) {
      res.json([]);
      return;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`c.status = $${p}`);
      values.push(status);
      p++;
    }
    if (campus) {
      conditions.push(`c.campus ILIKE $${p}`);
      values.push(`%${campus}%`);
      p++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM teachers t WHERE t.coordinator_id = c.id) AS teachers_count
       FROM coordinators c
       ${where}
       ORDER BY c.name ASC`,
      values
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/coordinators/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM teachers t WHERE t.coordinator_id = c.id) AS teachers_count
       FROM coordinators c
       WHERE c.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
