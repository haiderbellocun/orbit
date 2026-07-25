import { Router } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import { schoolScopeFromRequest } from "../middleware/orbitAuth";

const router = Router();

router.get("/catalog/areas", async (_req, res) => {
  try {
    const coreMode = await resolveCoreSchemaMode();
    if (coreMode == null) {
      res.json([]);
      return;
    }
    const table = qualifiedCoreTable(coreMode, "area");
    const { rows } = await pool.query(
      `SELECT id, name
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /catalog/areas failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/catalog/schools", async (req, res) => {
  try {
    const coreMode = await resolveCoreSchemaMode();
    if (coreMode == null) {
      res.json([]);
      return;
    }
    const schoolScope = schoolScopeFromRequest(req);
    const table = qualifiedCoreTable(coreMode, "school");
    if (schoolScope != null) {
      const { rows } = await pool.query(
        `SELECT id, name, area_id
         FROM ${table}
         WHERE id = $1 AND COALESCE(is_active, true) = true`,
        [schoolScope.schoolId]
      );
      res.json(rows);
      return;
    }
    const areaIdRaw =
      typeof req.query.area_id === "string" ? req.query.area_id.trim() : "";
    const areaId = areaIdRaw ? Number.parseInt(areaIdRaw, 10) : null;
    if (areaIdRaw && (areaId == null || Number.isNaN(areaId))) {
      res.status(400).json({ error: "Invalid area_id" });
      return;
    }

    const active = `COALESCE(is_active, true) = true`;
    if (areaId == null) {
      const { rows } = await pool.query(
        `SELECT id, name, area_id
         FROM ${table}
         WHERE ${active}
         ORDER BY name ASC`
      );
      res.json(rows);
      return;
    }

    let result = await pool.query(
      `SELECT id, name, area_id
       FROM ${table}
       WHERE ${active} AND area_id = $1
       ORDER BY name ASC`,
      [areaId]
    );
    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT id, name, area_id
         FROM ${table}
         WHERE ${active} AND area_id IS NULL
         ORDER BY name ASC`
      );
    }
    res.json(result.rows);
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
    const table = qualifiedCoreTable(coreMode, "program");
    const schoolT = qualifiedCoreTable(coreMode, "school");
    const personT = qualifiedCoreTable(coreMode, "person");
    const schoolScope = schoolScopeFromRequest(req);

    const areaIdRaw =
      typeof req.query.area_id === "string" ? req.query.area_id.trim() : "";
    const areaId = areaIdRaw ? Number.parseInt(areaIdRaw, 10) : null;
    if (areaIdRaw && (areaId == null || Number.isNaN(areaId) || areaId <= 0)) {
      res.status(400).json({ error: "Invalid area_id" });
      return;
    }

    const schoolIdRaw = schoolScope
      ? String(schoolScope.schoolId)
      : typeof req.query.school_id === "string"
        ? req.query.school_id.trim()
        : "";
    const schoolId = schoolIdRaw ? Number.parseInt(schoolIdRaw, 10) : null;
    if (schoolIdRaw && (schoolId == null || Number.isNaN(schoolId))) {
      res.status(400).json({ error: "Invalid school_id" });
      return;
    }

    const baseActive = `COALESCE(pr.is_active, true) = true`;

    // Por escuela: programas del catálogo + los ya asignados a personas de esa escuela.
    if (schoolId != null) {
      const { rows } = await pool.query(
        `SELECT DISTINCT pr.id, pr.name, pr.school_id
         FROM ${table} pr
         WHERE ${baseActive}
           AND (
             pr.school_id = $1
             OR pr.id IN (
               SELECT DISTINCT p.program_id
               FROM ${personT} p
               WHERE p.school_id = $1
                 AND p.program_id IS NOT NULL
             )
           )
         ORDER BY pr.name ASC`,
        [schoolId]
      );
      res.json(rows);
      return;
    }

    // Por área: programas de escuelas del área + usados por personas del área.
    if (areaId != null) {
      const { rows } = await pool.query(
        `SELECT DISTINCT pr.id, pr.name, pr.school_id
         FROM ${table} pr
         WHERE ${baseActive}
           AND (
             pr.school_id IN (
               SELECT s.id FROM ${schoolT} s
               WHERE s.area_id = $1 AND COALESCE(s.is_active, true) = true
             )
             OR pr.id IN (
               SELECT DISTINCT p.program_id
               FROM ${personT} p
               LEFT JOIN ${schoolT} s ON s.id = p.school_id
               WHERE p.program_id IS NOT NULL
                 AND COALESCE(p.area_id, s.area_id) = $1
             )
           )
         ORDER BY pr.name ASC`,
        [areaId]
      );
      res.json(rows);
      return;
    }

    const { rows } = await pool.query(
      `SELECT pr.id, pr.name, pr.school_id
       FROM ${table} pr
       WHERE ${baseActive}
       ORDER BY pr.name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /catalog/programs failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/catalog/academic-lines", async (_req, res) => {
  try {
    /**
     * No usar solo qualifiedCoreTable(resolveCoreSchemaMode()): si el modo
     * cae en `public` pero los datos viven en `core` (o al revés), la lista
     * queda vacía. Unimos ambos esquemas donde exista la tabla.
     */
    const reg = await pool.query(
      `SELECT to_regclass('core.person_program_assignments') AS c,
              to_regclass('public.person_program_assignments') AS p`
    );
    const r = reg.rows[0] as { c: string | null; p: string | null };
    const subs: string[] = [];
    if (r.c) {
      subs.push(
        `SELECT DISTINCT btrim(academic_line::text) AS line
         FROM core.person_program_assignments
         WHERE academic_line IS NOT NULL AND btrim(academic_line::text) <> ''`
      );
    }
    if (r.p) {
      subs.push(
        `SELECT DISTINCT btrim(academic_line::text) AS line
         FROM public.person_program_assignments
         WHERE academic_line IS NOT NULL AND btrim(academic_line::text) <> ''`
      );
    }
    if (subs.length === 0) {
      res.json([]);
      return;
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT line FROM (${subs.join(" UNION ALL ")}) AS u
       ORDER BY line ASC
       LIMIT 500`
    );
    res.json(rows.map((x) => String((x as { line: unknown }).line)));
  } catch (e) {
    console.error("GET /catalog/academic-lines failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/catalog/roles", async (_req, res) => {
  try {
    const coreMode = await resolveCoreSchemaMode();
    if (coreMode == null) {
      res.json([]);
      return;
    }
    const table = qualifiedCoreTable(coreMode, "role");
    const { rows } = await pool.query(
      `SELECT id, name
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /catalog/roles failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
