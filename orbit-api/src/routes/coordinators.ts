import { Router } from "express";
import { pool } from "../db/connection";
import {
  insertAutoVacancyOnDeactivate,
  personMatchesAcademicCoordinator,
} from "../lib/createVacancyOnDeactivate";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";
import { getLiteRoleId } from "../lib/orbitRoles";

const router = Router();

type CoreSchemaMode = "public" | "core";

async function resolveCoreSchemaMode(): Promise<CoreSchemaMode | null> {
  // Algunos entornos tienen las tablas CORE en schema `core` (core.person),
  // otros las crean en el schema del search_path (ej: public.person).
  const preferred = (process.env.DB_SCHEMA ?? "").trim().toLowerCase();
  const result = await pool.query(
    `SELECT
       to_regclass('public.person') AS person_public,
       to_regclass('core.person') AS person_core`
  );
  const row = result.rows[0] as
    | { person_public?: string | null; person_core?: string | null }
    | undefined;
  if (preferred === "core" && row?.person_core) return "core";
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
      const liteRoleId = getLiteRoleId();
      const prefix = coreMode === "core" ? "core." : "";
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
      conditions.push(sqlPersonIsActive("p"));

      const where = `WHERE ${conditions.join(" AND ")}`;

      /** LITEs por `ORBIT_LITE_ROLE_ID` (defecto 9); misma escuela que el coordinador. */
      const litesCountExpr = `(
        SELECT COUNT(*)::int
        FROM ${prefix}person pl
        WHERE pl.role_id = ${liteRoleId}
          AND ${sqlPersonIsActive("pl")}
          AND pl.school_id IS NOT NULL
          AND p.school_id IS NOT NULL
          AND pl.school_id = p.school_id
      )`;

      const { rows } = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name AS name,
           COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) AS email,
           COALESCE(a.name, ci.name, '') AS campus,
           COALESCE(s.name, '') AS school,
           ${sqlPersonStatusText("p")} AS status,
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

    const coreMode = await resolveCoreSchemaMode();
    if (coreMode != null) {
      const prefix = coreMode === "core" ? "core." : "";
      const { rows } = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name AS name,
           p.edu_email AS edu_email,
           p.email AS personal_email,
           p.phone AS phone,
           p.address AS address,
           p.school_id AS school_id,
           COALESCE(s.name, '') AS school,
           COALESCE(a.name, ci.name, '') AS campus,
           ${sqlPersonStatusText("p")} AS status
         FROM ${prefix}person p
         LEFT JOIN ${prefix}school s ON s.id = p.school_id
         LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
         LEFT JOIN ${prefix}city ci ON ci.id = p.city_id
         WHERE p.id = $1
           AND ${sqlPersonIsActive("p")}
         LIMIT 1`,
        [id]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(rows[0]);
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

router.patch("/coordinators/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const schoolId =
    typeof body.school_id === "number"
      ? body.school_id
      : typeof body.school_id === "string"
        ? Number.parseInt(body.school_id, 10)
        : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const personalEmail =
    typeof body.personal_email === "string" ? body.personal_email.trim() : null;
  const address = typeof body.address === "string" ? body.address.trim() : null;
  const isActivePatch =
    typeof body.is_active === "boolean" ? body.is_active : undefined;

  if (schoolId != null && Number.isNaN(Number(schoolId))) {
    res.status(400).json({ error: "Invalid school_id" });
    return;
  }

  const coreMode = await resolveCoreSchemaMode();
  if (coreMode == null) {
    res.status(501).json({ error: "CORE schema not available" });
    return;
  }
  const prefix = coreMode === "core" ? "core." : "";

  try {
    const preDeactivate = await pool.query(
      `SELECT
         COALESCE(p.is_active, true) AS was_active,
         p.full_name,
         p.program_id
       FROM ${prefix}person p
       WHERE p.id = $1`,
      [id]
    );
    if (preDeactivate.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const setParts: string[] = [
      "school_id = COALESCE($2, school_id)",
      "phone = COALESCE($3, phone)",
      "email = COALESCE($4, email)",
      "address = COALESCE($5, address)",
    ];
    const params: unknown[] = [id, schoolId, phone, personalEmail, address];
    let pIdx = 6;
    if (isActivePatch !== undefined) {
      setParts.push(`is_active = $${pIdx}`);
      params.push(isActivePatch);
      pIdx++;
    }
    setParts.push("updated_at = NOW()");

    const updated = await pool.query(
      `UPDATE ${prefix}person
       SET ${setParts.join(", ")}
       WHERE id = $1
       RETURNING id`,
      params
    );
    if (updated.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const refreshed = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.full_name AS name,
         p.edu_email AS edu_email,
         p.email AS personal_email,
         p.phone AS phone,
         p.address AS address,
         p.school_id AS school_id,
         COALESCE(s.name, '') AS school,
         COALESCE(a.name, ci.name, '') AS campus,
         ${sqlPersonStatusText("p")} AS status
       FROM ${prefix}person p
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       LEFT JOIN ${prefix}city ci ON ci.id = p.city_id
       WHERE p.id = $1
       LIMIT 1`,
      [id]
    );

    res.json(refreshed.rows[0] ?? null);

    const pre = preDeactivate.rows[0] as {
      was_active: boolean;
      full_name: string | null;
      program_id: number | null;
    };
    if (isActivePatch === false && pre.was_active) {
      try {
        const isCoord = await personMatchesAcademicCoordinator(id);
        if (isCoord) {
          const effProg =
            pre.program_id != null && Number.isFinite(Number(pre.program_id))
              ? Number(pre.program_id)
              : null;
          await insertAutoVacancyOnDeactivate({
            personId: id,
            positionName: "COORDINADOR ACADÉMICO",
            effectiveProgramId: effProg,
            curricularLine: null,
            personFullName:
              pre.full_name != null ? String(pre.full_name) : null,
          });
        }
      } catch (vacErr) {
        console.error("Auto vacancy (coordinador) failed:", vacErr);
      }
    }
  } catch (e) {
    console.error("PATCH /coordinators/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});
