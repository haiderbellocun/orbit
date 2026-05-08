import { Router, Request, Response } from "express";
import { pool } from "../db/connection";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";

const router = Router();

/** Rol CORE para personas LITE (Líder de Investigación y Transformación EDU). */
const LITE_ROLE_ID = 9;

type CoreSchemaMode = "public" | "core";

async function resolveCoreSchemaMode(): Promise<CoreSchemaMode | null> {
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

/** Misma definición de “coordinador académico” que en GET /coordinators (CORE). */
function coordinatorMatchSql(areaAlias: string, hierarchyAlias: string, roleAlias: string): string {
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

router.get("/lites", async (req: Request, res: Response) => {
  try {
    const {
      search,
      school,
      status,
      coordinator_document,
      page = "1",
      limit = "50",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(200, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const coreMode = await resolveCoreSchemaMode();
    if (coreMode != null) {
      const prefix = coreMode === "core" ? "core." : "";
      const conditions: string[] = [
        `p.role_id = ${LITE_ROLE_ID}`,
        sqlPersonIsActive("p"),
      ];
      const values: unknown[] = [];
      let i = 1;

      if (search) {
        conditions.push(
          `(p.full_name ILIKE $${i} OR COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) ILIKE $${i} OR pr.name ILIKE $${i})`
        );
        values.push(`%${search}%`);
        i++;
      }
      if (school) {
        conditions.push(`s.name ILIKE $${i}`);
        values.push(`%${school}%`);
        i++;
      }
      if (status && status !== "active") {
        res.json({
          data: [],
          pagination: {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
          },
        });
        return;
      }
      const coordDoc =
        typeof coordinator_document === "string"
          ? coordinator_document.trim()
          : "";
      if (coordDoc) {
        conditions.push(`EXISTS (
          SELECT 1
          FROM ${prefix}person pc
          LEFT JOIN ${prefix}school sc ON sc.id = pc.school_id
          LEFT JOIN ${prefix}area ac ON ac.id = COALESCE(pc.area_id, sc.area_id)
          LEFT JOIN ${prefix}hierarchy hc ON hc.id = pc.hierarchy_id
          LEFT JOIN ${prefix}role rc ON rc.id = pc.role_id
          WHERE pc.document = $${i}
            AND ${sqlPersonIsActive("pc")}
            AND pc.school_id IS NOT NULL
            AND p.school_id IS NOT NULL
            AND pc.school_id = p.school_id
            AND ${coordinatorMatchSql("ac", "hc", "rc")}
        )`);
        values.push(coordDoc);
        i++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const coordJoin = coordinatorMatchSql("ca", "ch", "cr");

      const query = `
        SELECT
          p.id,
          p.full_name AS name,
          COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) AS email,
          pr.name AS program,
          s.name AS school,
          ppa.academic_line AS academic_line,
          COALESCE(progs.programs, ARRAY[]::text[]) AS programs,
          crd.coordinator_name,
          crd.coordinator_document,
          ${sqlPersonStatusText("p")} AS status,
          COUNT(*) OVER() AS total_count
        FROM ${prefix}person p
        LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
        LEFT JOIN ${prefix}school s ON s.id = p.school_id
        LEFT JOIN ${prefix}person_program_assignments ppa ON ppa.person_id = p.id
        LEFT JOIN LATERAL (
          SELECT array_agg(pr2.name ORDER BY pr2.name) AS programs
          FROM ${prefix}program pr2
          WHERE pr2.id = ANY(ppa.programs_id)
        ) progs ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            pc.document AS coordinator_document,
            pc.full_name AS coordinator_name
          FROM ${prefix}person pc
          LEFT JOIN ${prefix}school sco ON sco.id = pc.school_id
          LEFT JOIN ${prefix}area ca ON ca.id = COALESCE(pc.area_id, sco.area_id)
          LEFT JOIN ${prefix}hierarchy ch ON ch.id = pc.hierarchy_id
          LEFT JOIN ${prefix}role cr ON cr.id = pc.role_id
          WHERE ${sqlPersonIsActive("pc")}
            AND pc.school_id IS NOT NULL
            AND p.school_id IS NOT NULL
            AND pc.school_id = p.school_id
            AND ${coordJoin}
          ORDER BY pc.full_name ASC NULLS LAST
          LIMIT 1
        ) crd ON TRUE
        ${where}
        ORDER BY p.full_name ASC NULLS LAST
        LIMIT $${i} OFFSET $${i + 1}
      `;
      values.push(limitNum, offset);

      const result = await pool.query(query, values);
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
      return;
    }

    const conditions: string[] = [];
    const valuesLegacy: unknown[] = [];
    let j = 1;

    if (search) {
      conditions.push(`(name ILIKE $${j} OR email ILIKE $${j} OR program ILIKE $${j})`);
      valuesLegacy.push(`%${search}%`);
      j++;
    }
    if (school) {
      conditions.push(`school ILIKE $${j++}`);
      valuesLegacy.push(`%${school}%`);
    }
    if (status) {
      conditions.push(`status = $${j++}`);
      valuesLegacy.push(status);
    }
    if (coordinator_document) {
      conditions.push(`coordinator_document = $${j++}`);
      valuesLegacy.push(coordinator_document);
    }

    const whereLegacy = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const queryLegacy = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM lites
      ${whereLegacy}
      ORDER BY name ASC
      LIMIT $${j++} OFFSET $${j++}
    `;
    valuesLegacy.push(limitNum, offset);

    const result = await pool.query(queryLegacy, valuesLegacy);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      data: result.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/lites/:id", async (req: Request, res: Response) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const coreMode = await resolveCoreSchemaMode();
    if (coreMode != null) {
      const prefix = coreMode === "core" ? "core." : "";
      const coordJoin = coordinatorMatchSql("ca", "ch", "cr");

      const result = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name AS name,
           p.edu_email AS edu_email,
           p.email AS personal_email,
           p.phone AS phone,
           p.address AS address,
           pr.name AS program,
           p.school_id AS school_id,
           s.name AS school,
           ppa.academic_line AS academic_line,
           COALESCE(ppa.programs_id, ARRAY[]::int[]) AS programs_id,
           COALESCE(progs.programs, ARRAY[]::text[]) AS programs,
           crd.coordinator_name,
           crd.coordinator_document,
           ${sqlPersonStatusText("p")} AS status
         FROM ${prefix}person p
         LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
         LEFT JOIN ${prefix}school s ON s.id = p.school_id
         LEFT JOIN ${prefix}person_program_assignments ppa ON ppa.person_id = p.id
         LEFT JOIN LATERAL (
           SELECT array_agg(pr2.name ORDER BY pr2.name) AS programs
           FROM ${prefix}program pr2
           WHERE pr2.id = ANY(ppa.programs_id)
         ) progs ON TRUE
         LEFT JOIN LATERAL (
           SELECT
             pc.document AS coordinator_document,
             pc.full_name AS coordinator_name
           FROM ${prefix}person pc
           LEFT JOIN ${prefix}school sco ON sco.id = pc.school_id
           LEFT JOIN ${prefix}area ca ON ca.id = COALESCE(pc.area_id, sco.area_id)
           LEFT JOIN ${prefix}hierarchy ch ON ch.id = pc.hierarchy_id
           LEFT JOIN ${prefix}role cr ON cr.id = pc.role_id
           WHERE ${sqlPersonIsActive("pc")}
             AND pc.school_id IS NOT NULL
             AND p.school_id IS NOT NULL
             AND pc.school_id = p.school_id
             AND ${coordJoin}
           ORDER BY pc.full_name ASC NULLS LAST
           LIMIT 1
         ) crd ON TRUE
         WHERE p.id = $1 AND p.role_id = ${LITE_ROLE_ID}
           AND ${sqlPersonIsActive("p")}`,
        [id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(result.rows[0]);
      return;
    }

    const result = await pool.query("SELECT * FROM lites WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

router.patch("/lites/:id", async (req: Request, res: Response) => {
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
  const academicLine =
    typeof body.academic_line === "string" ? body.academic_line.trim() : null;

  const isActivePatch =
    typeof body.is_active === "boolean" ? body.is_active : undefined;

  const programsIdRaw = (body.programs_id ?? null) as unknown;
  const programsId =
    Array.isArray(programsIdRaw) && programsIdRaw.length > 0
      ? programsIdRaw
          .map((x) =>
            typeof x === "number"
              ? x
              : typeof x === "string"
                ? Number.parseInt(x, 10)
                : NaN
          )
          .filter((n) => Number.isFinite(n)) as number[]
      : [];

  if (schoolId != null && Number.isNaN(Number(schoolId))) {
    res.status(400).json({ error: "Invalid school_id" });
    return;
  }
  if (programsId.some((n) => !Number.isFinite(n))) {
    res.status(400).json({ error: "Invalid programs_id" });
    return;
  }

  const shouldTouchAssignments =
    Object.prototype.hasOwnProperty.call(body, "programs_id") ||
    Object.prototype.hasOwnProperty.call(body, "academic_line");

  const coreMode = await resolveCoreSchemaMode();
  if (coreMode == null) {
    res.status(501).json({ error: "CORE schema not available" });
    return;
  }

  const prefix = coreMode === "core" ? "core." : "";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Update base person fields (except edu_email/document).
    const primaryProgramId = programsId.length > 0 ? programsId[0] : null;
    const setParts: string[] = [
      "school_id = COALESCE($2, school_id)",
      "phone = COALESCE($3, phone)",
      "email = COALESCE($4, email)",
      "address = COALESCE($5, address)",
      "program_id = COALESCE($6, program_id)",
    ];
    const updateParams: unknown[] = [
      id,
      schoolId,
      phone,
      personalEmail,
      address,
      primaryProgramId,
    ];
    let pIdx = 7;
    if (isActivePatch !== undefined) {
      setParts.push(`is_active = $${pIdx}`);
      updateParams.push(isActivePatch);
      pIdx++;
    }
    setParts.push("updated_at = NOW()");

    const updatePerson = await client.query(
      `UPDATE ${prefix}person
       SET ${setParts.join(", ")}
       WHERE id = $1 AND role_id = ${LITE_ROLE_ID}
       RETURNING id`,
      updateParams
    );

    if (updatePerson.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Not found" });
      return;
    }

    // 2) Upsert program assignments (solo si el cliente envía programs_id o academic_line)
    if (shouldTouchAssignments) {
      await client.query(
        `INSERT INTO ${prefix}person_program_assignments (person_id, programs_id, academic_line)
         VALUES ($1, $2::INTEGER[], $3)
         ON CONFLICT (person_id) DO UPDATE SET
           programs_id = EXCLUDED.programs_id,
           academic_line = EXCLUDED.academic_line,
           updated_at = NOW()`,
        [id, programsId, academicLine]
      );
    }

    await client.query("COMMIT");

    // 3) Return refreshed profile shape (same as GET /lites/:id)
    const coordJoin = coordinatorMatchSql("ca", "ch", "cr");
    const refreshed = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.full_name AS name,
         p.edu_email AS edu_email,
         p.email AS personal_email,
         p.phone AS phone,
         p.address AS address,
         pr.name AS program,
         p.school_id AS school_id,
         s.name AS school,
         ppa.academic_line AS academic_line,
         COALESCE(ppa.programs_id, ARRAY[]::int[]) AS programs_id,
         COALESCE(progs.programs, ARRAY[]::text[]) AS programs,
         crd.coordinator_name,
         crd.coordinator_document,
         ${sqlPersonStatusText("p")} AS status
       FROM ${prefix}person p
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}person_program_assignments ppa ON ppa.person_id = p.id
       LEFT JOIN LATERAL (
         SELECT array_agg(pr2.name ORDER BY pr2.name) AS programs
         FROM ${prefix}program pr2
         WHERE pr2.id = ANY(ppa.programs_id)
       ) progs ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           pc.document AS coordinator_document,
           pc.full_name AS coordinator_name
         FROM ${prefix}person pc
         LEFT JOIN ${prefix}school sco ON sco.id = pc.school_id
         LEFT JOIN ${prefix}area ca ON ca.id = COALESCE(pc.area_id, sco.area_id)
         LEFT JOIN ${prefix}hierarchy ch ON ch.id = pc.hierarchy_id
         LEFT JOIN ${prefix}role cr ON cr.id = pc.role_id
         WHERE ${sqlPersonIsActive("pc")}
           AND pc.school_id IS NOT NULL
           AND p.school_id IS NOT NULL
           AND pc.school_id = p.school_id
           AND ${coordJoin}
         ORDER BY pc.full_name ASC NULLS LAST
         LIMIT 1
       ) crd ON TRUE
       WHERE p.id = $1 AND p.role_id = ${LITE_ROLE_ID}
       LIMIT 1`,
      [id]
    );

    res.json(refreshed.rows[0] ?? null);
  } catch (err) {
    console.error("PATCH /lites/:id failed:", err);
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});
