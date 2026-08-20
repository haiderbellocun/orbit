import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import { resolveCoreSchemaMode } from "../lib/coreSchema";
import {
  DEFAULT_CLASS_PREPARATION_HOURS,
  PLACEHOLDER_SUBSTANTIVE_CATEGORY,
  parsePositiveIntHours,
  weeklyContractHoursFromLabels,
} from "../lib/substantiveHours";
import { schoolScopeFromRequest } from "../middleware/orbitAuth";
import { sqlPersonIsActive } from "../sql/personActive";

const router = Router();

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** GET /substantive-hours/categories */
router.get("/substantive-hours/categories", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name
       FROM substantive_hours.category
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC`
    );
    if (result.rows.length === 0) {
      res.json({
        data: [{ id: null, name: PLACEHOLDER_SUBSTANTIVE_CATEGORY }],
      });
      return;
    }
    res.json({
      data: result.rows.map((r) => ({
        id: r.id as number,
        name: String(r.name),
      })),
    });
  } catch (err) {
    console.error("GET /substantive-hours/categories", err);
    res.status(500).json({ error: "Error al listar categorías" });
  }
});

/**
 * GET /substantive-hours/teachers
 * Lista docentes activos con resumen de horas (contrato / cátedra / prep / sustantivas).
 *
 * Filtros:
 *  search, area_id, school_id, period (cátedra),
 *  contract_hours (21|42), availability (available|none|unknown),
 *  has_catedra (true|false), has_substantive (true|false),
 *  without_edu_email (true)
 */
router.get("/substantive-hours/teachers", async (req: Request, res: Response) => {
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
    const period =
      typeof req.query.period === "string" ? req.query.period.trim() : "";
    const contractHoursRaw = String(
      req.query.contract_hours ?? req.query.contractHours ?? ""
    ).trim();
    const contractHoursFilter =
      contractHoursRaw === "21" || contractHoursRaw === "42"
        ? Number(contractHoursRaw)
        : null;
    const availability = String(
      req.query.availability ?? ""
    )
      .trim()
      .toLowerCase();
    const hasCatedraRaw = String(
      req.query.has_catedra ?? req.query.hasCatedra ?? ""
    )
      .trim()
      .toLowerCase();
    const hasSubstantiveRaw = String(
      req.query.has_substantive ?? req.query.hasSubstantive ?? ""
    )
      .trim()
      .toLowerCase();
    const withoutEduEmailRaw = String(
      req.query.without_edu_email ?? req.query.withoutEduEmail ?? ""
    )
      .trim()
      .toLowerCase();
    const withoutEduEmail =
      withoutEduEmailRaw === "1" ||
      withoutEduEmailRaw === "true" ||
      withoutEduEmailRaw === "yes";

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

    if (search) {
      conditions.push(
        `(p.full_name ILIKE $${i} OR p.document ILIKE $${i} OR COALESCE(p.edu_email, p.email, '') ILIKE $${i})`
      );
      values.push(`%${search}%`);
      i++;
    }

    let periodSql = "";
    if (period) {
      periodSql = ` AND al.period_code = $${i}`;
      values.push(period);
      i++;
    }

    // Jornada inferida en SQL (alineada a weeklyContractHoursFromLabels).
    const contractHoursExpr = `
      CASE
        WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
          ~ '(medio|media|medio[[:space:]]*tiempo|1/2|[[:<:]]21[[:>:]])' THEN 21
        WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
          ~ '(tiempo[[:space:]]*completo|[[:<:]]completo[[:>:]]|[[:<:]]full[[:>:]]|[[:<:]]42[[:>:]])' THEN 42
        ELSE NULL
      END
    `;

    if (contractHoursFilter != null) {
      conditions.push(`(${contractHoursExpr}) = $${i}`);
      values.push(contractHoursFilter);
      i++;
    }

    if (hasCatedraRaw === "true" || hasCatedraRaw === "1") {
      conditions.push(`COALESCE(cath.catedra_hours, 0) > 0`);
    } else if (hasCatedraRaw === "false" || hasCatedraRaw === "0") {
      conditions.push(`COALESCE(cath.catedra_hours, 0) = 0`);
    }

    if (hasSubstantiveRaw === "true" || hasSubstantiveRaw === "1") {
      conditions.push(`COALESCE(sub.substantive_hours, 0) > 0`);
    } else if (hasSubstantiveRaw === "false" || hasSubstantiveRaw === "0") {
      conditions.push(`COALESCE(sub.substantive_hours, 0) = 0`);
    }

    if (withoutEduEmail) {
      conditions.push(`(p.edu_email IS NULL OR TRIM(p.edu_email) = '')`);
    }

    // Balance carga: excluir Área investigativa (Harvey).
    conditions.push(`(
      a.id IS NULL
      OR (
        COALESCE(a.name, '') NOT ILIKE '%investigativ%'
        AND COALESCE(a.name, '') NOT ILIKE '%harvey%'
      )
    )`);

    const remainingExpr = `
      (${contractHoursExpr})
      - COALESCE(cath.catedra_hours, 0)
      - COALESCE(cp.class_preparation_hours, ${DEFAULT_CLASS_PREPARATION_HOURS})
      - COALESCE(sub.substantive_hours, 0)
    `;

    if (availability === "available") {
      conditions.push(
        `(${contractHoursExpr}) IS NOT NULL AND (${remainingExpr}) > 0`
      );
    } else if (availability === "none") {
      conditions.push(
        `(${contractHoursExpr}) IS NOT NULL AND (${remainingExpr}) <= 0`
      );
    } else if (availability === "unknown") {
      conditions.push(`(${contractHoursExpr}) IS NULL`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        p.id,
        p.document,
        p.full_name AS name,
        NULLIF(TRIM(p.edu_email), '') AS email,
        a.name AS area,
        s.name AS school,
        ct.name AS contract_type,
        ct.work_schedule,
        COALESCE(cp.class_preparation_hours, ${DEFAULT_CLASS_PREPARATION_HOURS})
          AS preparation_hours,
        COALESCE(cath.catedra_hours, 0) AS catedra_hours,
        COALESCE(sub.substantive_hours, 0) AS substantive_hours_assigned,
        COUNT(*) OVER() AS total_count
      FROM ${prefix}person p
      LEFT JOIN ${prefix}school s ON s.id = p.school_id
      LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
      LEFT JOIN ${prefix}contract_type ct ON ct.id = p.contract_type_id
      LEFT JOIN LATERAL (
        SELECT cp0.class_preparation_hours
        FROM academic_workload.class_preparation cp0
        WHERE cp0.person_id = p.id
        ORDER BY cp0.updated_at DESC NULLS LAST, cp0.id DESC
        LIMIT 1
      ) cp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          SUM(
            COALESCE(
              NULLIF(subj.hours_quantity, 0),
              NULLIF(al.substantive_hours_quantity, 0),
              0
            )
          ),
          0
        ) AS catedra_hours
        FROM academic_workload.academic_load al
        LEFT JOIN academic_workload.subject subj
          ON subj.subject_code = al.subject_code
        WHERE al.person_id = p.id${periodSql}
      ) cath ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(a.hours_quantity), 0) AS substantive_hours
        FROM substantive_hours.assignment a
        WHERE a.person_id = p.id
      ) sub ON true
      ${where}
      ORDER BY p.full_name ASC NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(limitNum, offset);

    const result = await pool.query(query, values);
    const total =
      result.rows.length > 0 ? Number.parseInt(String(result.rows[0].total_count), 10) : 0;

    const data = result.rows.map((r) => {
      const contractHours = weeklyContractHoursFromLabels(
        r.work_schedule as string | null,
        r.contract_type as string | null
      );
      const preparationHours = Number(r.preparation_hours) || DEFAULT_CLASS_PREPARATION_HOURS;
      const catedraHours = Number(r.catedra_hours) || 0;
      const substantiveAssigned = Number(r.substantive_hours_assigned) || 0;
      const remaining =
        contractHours != null
          ? Math.max(
              0,
              contractHours - catedraHours - preparationHours - substantiveAssigned
            )
          : null;

      return {
        id: String(r.id),
        document: r.document != null ? String(r.document) : "",
        name: r.name != null ? String(r.name) : "",
        email: r.email != null ? String(r.email) : "",
        area: r.area != null ? String(r.area) : "",
        school: r.school != null ? String(r.school) : "",
        contractType: r.contract_type != null ? String(r.contract_type) : "",
        workSchedule: r.work_schedule != null ? String(r.work_schedule) : "",
        contractHoursWeekly: contractHours,
        catedraHours,
        preparationHours,
        substantiveHoursAssigned: substantiveAssigned,
        substantiveHoursRemaining: remaining,
      };
    });

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: total > 0 ? Math.ceil(total / limitNum) : 0,
      },
    });
  } catch (err) {
    console.error("GET /substantive-hours/teachers", err);
    res.status(500).json({ error: "Error al listar docentes" });
  }
});

/** GET /substantive-hours/teachers/:personId/assignments */
router.get(
  "/substantive-hours/teachers/:personId/assignments",
  async (req: Request, res: Response) => {
    try {
      const personId = parsePositiveInt(req.params.personId);
      if (personId == null) {
        res.status(400).json({ error: "personId inválido" });
        return;
      }

      const assignments = await pool.query(
        `SELECT
           a.id,
           a.person_id,
           a.category_id,
           COALESCE(cat.name, $2) AS category_name,
           a.hours_quantity,
           a.created_at,
           a.updated_at
         FROM substantive_hours.assignment a
         LEFT JOIN substantive_hours.category cat ON cat.id = a.category_id
         WHERE a.person_id = $1
         ORDER BY a.created_at DESC, a.id DESC`,
        [personId, PLACEHOLDER_SUBSTANTIVE_CATEGORY]
      );

      const ids = assignments.rows.map((r) => r.id as number);
      let tasksByAssignment = new Map<number, { id: number; description: string; sortOrder: number }[]>();
      if (ids.length > 0) {
        const tasks = await pool.query(
          `SELECT id, assignment_id, description, sort_order
           FROM substantive_hours.assignment_task
           WHERE assignment_id = ANY($1::int[])
           ORDER BY sort_order ASC, id ASC`,
          [ids]
        );
        tasksByAssignment = new Map();
        for (const t of tasks.rows) {
          const aid = t.assignment_id as number;
          const list = tasksByAssignment.get(aid) ?? [];
          list.push({
            id: t.id as number,
            description: String(t.description),
            sortOrder: Number(t.sort_order) || 0,
          });
          tasksByAssignment.set(aid, list);
        }
      }

      res.json({
        data: assignments.rows.map((r) => ({
          id: r.id as number,
          personId: r.person_id as number,
          categoryId: r.category_id as number | null,
          categoryName: String(r.category_name),
          hoursQuantity: Number(r.hours_quantity),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          tasks: tasksByAssignment.get(r.id as number) ?? [],
        })),
      });
    } catch (err) {
      console.error("GET /substantive-hours/teachers/:personId/assignments", err);
      res.status(500).json({ error: "Error al listar asignaciones" });
    }
  }
);

/**
 * POST /substantive-hours/assignments
 * Body: { personId, categoryId?, hoursQuantity, tasks: string[] }
 */
router.post("/substantive-hours/assignments", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const body = req.body ?? {};
    const personId = parsePositiveInt(body.personId ?? body.person_id);
    const categoryId = parsePositiveInt(
      body.categoryId ??
        body.category_id ??
        body.projectId ??
        body.project_id
    );
    const hoursQuantity = parsePositiveIntHours(
      body.hoursQuantity ?? body.hours_quantity
    );
    const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
    const tasks = rawTasks
      .map((t: unknown) => String(t ?? "").trim())
      .filter((t: string) => t.length > 0);

    if (personId == null) {
      res.status(400).json({ error: "personId es obligatorio" });
      return;
    }
    if (hoursQuantity == null) {
      res.status(400).json({
        error: "hoursQuantity debe ser un entero ≥ 1 (sin decimales)",
      });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(500).json({ error: "Esquema de personas no disponible" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const personCheck = await client.query(
      `SELECT id FROM ${prefix}person p WHERE p.id = $1 AND ${sqlPersonIsActive("p")}`,
      [personId]
    );
    if (personCheck.rows.length === 0) {
      res.status(404).json({ error: "Docente no encontrado" });
      return;
    }

    if (categoryId != null) {
      const cat = await client.query(
        `SELECT id FROM substantive_hours.category WHERE id = $1 AND COALESCE(is_active, true) = true`,
        [categoryId]
      );
      if (cat.rows.length === 0) {
        res.status(400).json({ error: "Categoría inválida" });
        return;
      }
    }

    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO substantive_hours.assignment (
         person_id, category_id, hours_quantity
       ) VALUES ($1, $2, $3)
       RETURNING id, person_id, category_id, hours_quantity, created_at, updated_at`,
      [personId, categoryId, hoursQuantity]
    );
    const assignment = inserted.rows[0];
    const assignmentId = assignment.id as number;

    const savedTasks: { id: number; description: string; sortOrder: number }[] = [];
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = await client.query(
        `INSERT INTO substantive_hours.assignment_task (
           assignment_id, description, sort_order
         ) VALUES ($1, $2, $3)
         RETURNING id, description, sort_order`,
        [assignmentId, tasks[idx], idx]
      );
      savedTasks.push({
        id: t.rows[0].id as number,
        description: String(t.rows[0].description),
        sortOrder: Number(t.rows[0].sort_order) || idx,
      });
    }

    await client.query("COMMIT");

    let categoryName = PLACEHOLDER_SUBSTANTIVE_CATEGORY;
    if (categoryId != null) {
      const catName = await pool.query(
        `SELECT name FROM substantive_hours.category WHERE id = $1`,
        [categoryId]
      );
      if (catName.rows[0]?.name) categoryName = String(catName.rows[0].name);
    }

    res.status(201).json({
      data: {
        id: assignmentId,
        personId: assignment.person_id as number,
        categoryId: (assignment.category_id as number | null) ?? null,
        categoryName,
        hoursQuantity: Number(assignment.hours_quantity),
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,
        tasks: savedTasks,
      },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("POST /substantive-hours/assignments", err);
    res.status(500).json({ error: "Error al guardar horas sustantivas" });
  } finally {
    client.release();
  }
});

/**
 * PUT /substantive-hours/teachers/:personId/class-preparation
 * Body: { hoursQuantity: number } — horas semanales de preparación de clase (≥ 0).
 * Upsert en academic_workload.class_preparation.
 * Valida que el balance semanal no quede negativo si hay jornada (42/21).
 */
router.put(
  "/substantive-hours/teachers/:personId/class-preparation",
  async (req: Request, res: Response) => {
    try {
      const personId = parsePositiveInt(req.params.personId);
      if (personId == null) {
        res.status(400).json({ error: "personId inválido" });
        return;
      }

      const rawHours =
        req.body?.hoursQuantity ??
        req.body?.hours_quantity ??
        req.body?.classPreparationHours ??
        req.body?.class_preparation_hours;
      const hours =
        typeof rawHours === "number"
          ? rawHours
          : typeof rawHours === "string" && /^\d+(\.\d+)?$/.test(rawHours.trim())
            ? Number(rawHours.trim())
            : null;
      if (hours == null || !Number.isFinite(hours) || hours < 0) {
        res.status(400).json({
          error: "hoursQuantity debe ser un número ≥ 0",
        });
        return;
      }
      // Guardamos con máximo 2 decimales (columna numeric(6,2)).
      const hoursQuantity = Math.round(hours * 100) / 100;

      const mode = await resolveCoreSchemaMode();
      if (mode == null) {
        res.status(500).json({ error: "Esquema de personas no disponible" });
        return;
      }
      const prefix = mode === "core" ? "core." : "";

      const personR = await pool.query(
        `SELECT
           p.id,
           p.full_name,
           ct.name AS contract_type,
           ct.work_schedule
         FROM ${prefix}person p
         LEFT JOIN ${prefix}contract_type ct ON ct.id = p.contract_type_id
         WHERE p.id = $1 AND ${sqlPersonIsActive("p")}`,
        [personId]
      );
      if (personR.rows.length === 0) {
        res.status(404).json({ error: "Docente no encontrado" });
        return;
      }
      const person = personR.rows[0];

      const [catedraR, substR] = await Promise.all([
        pool.query(
          `SELECT COALESCE(
             SUM(
               COALESCE(
                 NULLIF(subj.hours_quantity, 0),
                 NULLIF(al.substantive_hours_quantity, 0),
                 0
               )
             ),
             0
           ) AS catedra_hours
           FROM academic_workload.academic_load al
           LEFT JOIN academic_workload.subject subj
             ON subj.subject_code = al.subject_code
           WHERE al.person_id = $1`,
          [personId]
        ),
        pool.query(
          `SELECT COALESCE(SUM(a.hours_quantity), 0) AS substantive_hours
           FROM substantive_hours.assignment a
           WHERE a.person_id = $1`,
          [personId]
        ),
      ]);

      const contractHours = weeklyContractHoursFromLabels(
        person.work_schedule as string | null,
        person.contract_type as string | null
      );
      const catedraHours = Number(catedraR.rows[0]?.catedra_hours) || 0;
      const substantiveAssigned =
        Number(substR.rows[0]?.substantive_hours) || 0;

      if (contractHours != null) {
        const remaining =
          contractHours - catedraHours - hoursQuantity - substantiveAssigned;
        if (remaining < 0) {
          res.status(400).json({
            error: `La preparación (${hoursQuantity} h) deja el balance semanal en ${remaining} (tope ${contractHours} h). Ajusta el valor.`,
            detail: {
              contractHours,
              catedraHours,
              preparationHours: hoursQuantity,
              substantiveAssigned,
              remaining,
            },
          });
          return;
        }
      }

      const existing = await pool.query(
        `SELECT id
         FROM academic_workload.class_preparation
         WHERE person_id = $1
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [personId]
      );

      let row: {
        id: number;
        person_id: number;
        class_preparation_hours: string | number;
        updated_at: string;
      };
      if (existing.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE academic_workload.class_preparation
           SET class_preparation_hours = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, person_id, class_preparation_hours, updated_at`,
          [hoursQuantity, existing.rows[0].id]
        );
        row = updated.rows[0];
      } else {
        const inserted = await pool.query(
          `INSERT INTO academic_workload.class_preparation (
             class_preparation_hours, person_id
           ) VALUES ($1, $2)
           RETURNING id, person_id, class_preparation_hours, updated_at`,
          [hoursQuantity, personId]
        );
        row = inserted.rows[0];
      }

      const preparationHours = Number(row.class_preparation_hours) || 0;
      const remaining =
        contractHours != null
          ? Math.max(
              0,
              contractHours - catedraHours - preparationHours - substantiveAssigned
            )
          : null;

      res.json({
        data: {
          id: row.id as number,
          personId: row.person_id as number,
          preparationHours,
          contractHoursWeekly: contractHours,
          catedraHours,
          substantiveHoursAssigned: substantiveAssigned,
          substantiveHoursRemaining: remaining,
          updatedAt: row.updated_at,
        },
      });
    } catch (err) {
      console.error(
        "PUT /substantive-hours/teachers/:personId/class-preparation",
        err
      );
      res.status(500).json({ error: "Error al actualizar preparación de clase" });
    }
  }
);

export default router;
