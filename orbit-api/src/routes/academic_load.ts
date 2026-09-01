import { Router, Request, Response } from "express";
import { pool } from "../db/connection";
import { sqlPersonIsActive } from "../sql/personActive";
import { schoolScopeFromRequest } from "../middleware/orbitAuth";

const router = Router();

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function qStr(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** SQL expression: pregrado | especializacion | otro (from program name). */
const SQL_STUDY_LEVEL = `
  CASE
    WHEN COALESCE(al.program_name, pr.name, '') ILIKE '%especializ%'
      THEN 'especializacion'
    WHEN NULLIF(TRIM(COALESCE(al.program_name, pr.name, '')), '') IS NOT NULL
      THEN 'pregrado'
    ELSE 'otro'
  END
`;

function normalizeModalityQueryParam(value: string): {
  code: "P" | "V" | null;
  literal: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) return { code: null, literal: null };
  const ascii = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (ascii === "v" || ascii === "t") return { code: "V", literal: null };
  if (ascii === "p") return { code: "P", literal: null };
  if (ascii.startsWith("pres")) return { code: "P", literal: null };
  if (ascii.startsWith("vir")) return { code: "V", literal: null };
  return { code: null, literal: trimmed };
}

router.get("/academic-load/filter-options", async (req: Request, res: Response) => {
  try {
    const schoolScope = schoolScopeFromRequest(req);
    const schoolSql = schoolScope
      ? ` AND (p.school_id = $1 OR pr.school_id = $1)`
      : "";
    const params = schoolScope ? [schoolScope.schoolId] : [];

    const [periodsR, blocksR, programsR] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT al.period_code AS period
        FROM academic_workload.academic_load al
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        LEFT JOIN program pr ON pr.id = al.program_id
        WHERE al.period_code IS NOT NULL AND TRIM(al.period_code) <> ''${schoolSql}
        ORDER BY period DESC
        `,
        params
      ),
      pool.query(
        `
        SELECT DISTINCT TRIM(cg.block) AS block
        FROM academic_workload.class_group cg
        INNER JOIN academic_workload.academic_load al
          ON al.subject_code = cg.subject_code AND al.group_code = cg.group_code
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        LEFT JOIN program pr ON pr.id = al.program_id
        WHERE cg.block IS NOT NULL AND TRIM(cg.block) <> ''${schoolSql}
        ORDER BY block ASC
        `,
        params
      ),
      pool.query(
        `
        SELECT DISTINCT TRIM(COALESCE(al.program_name, pr.name, '')) AS program
        FROM academic_workload.academic_load al
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        LEFT JOIN program pr ON pr.id = al.program_id
        WHERE COALESCE(NULLIF(TRIM(al.program_name), ''), NULLIF(TRIM(pr.name), ''), NULL) IS NOT NULL${schoolSql}
        ORDER BY program ASC
        LIMIT 500
        `,
        params
      ),
    ]);

    res.json({
      periods: periodsR.rows.map((r) => String(r.period)).filter(Boolean),
      blocks: blocksR.rows.map((r) => String(r.block)).filter(Boolean),
      programs: programsR.rows.map((r) => String(r.program)).filter(Boolean),
      modalities: [
        { value: "P", label: "Presencial" },
        { value: "V", label: "Virtual" },
      ],
      studyLevels: [
        { value: "pregrado", label: "Pregrado" },
        { value: "especializacion", label: "Especialización" },
      ],
    });
  } catch (err) {
    console.error("GET /academic-load/filter-options", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic-load", async (req: Request, res: Response) => {
  try {
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limitNum = Math.min(
      500,
      Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100)
    );
    const offset = (pageNum - 1) * limitNum;

    const teacherDocument = qStr(req.query.teacher_document);
    const period = qStr(req.query.period);
    const unitName = qStr(req.query.unit_name ?? req.query.search);
    const modality = qStr(req.query.modality);
    const type = qStr(req.query.type);
    const program = qStr(req.query.program);
    const subject = qStr(req.query.subject);
    const groupCode = qStr(req.query.group_code ?? req.query.groupCode);
    const acaGroupId = qStr(req.query.aca_group_id ?? req.query.acaGroupId);
    const block = qStr(req.query.block);
    const areaId = parsePositiveInt(req.query.area_id ?? req.query.areaId);
    const schoolId = parsePositiveInt(req.query.school_id ?? req.query.schoolId);
    const studyLevel = qStr(
      req.query.study_level ?? req.query.studyLevel ?? req.query.program_level
    ).toLowerCase();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (teacherDocument) {
      conditions.push(`p.document ILIKE $${i++}`);
      values.push(`%${teacherDocument}%`);
    }
    if (period) {
      conditions.push(`al.period_code = $${i++}`);
      values.push(period);
    }
    if (unitName) {
      conditions.push(
        `(p.full_name ILIKE $${i}
          OR s.name ILIKE $${i}
          OR COALESCE(al.program_name, pr.name, '') ILIKE $${i}
          OR al.subject_code ILIKE $${i}
          OR COALESCE(al.aca_group_id, '') ILIKE $${i}
          OR p.document ILIKE $${i}
          OR COALESCE(p.email, '') ILIKE $${i}
          OR COALESCE(p.edu_email, '') ILIKE $${i})`
      );
      values.push(`%${unitName}%`);
      i++;
    }
    if (modality) {
      const { code, literal } = normalizeModalityQueryParam(modality);
      if (code === "V") {
        conditions.push(
          `(UPPER(TRIM(cg.modality)) IN ('V', 'T', 'VIRTUAL')
            OR LOWER(TRIM(cg.modality)) LIKE 'vir%')`
        );
      } else if (code === "P") {
        conditions.push(
          `(UPPER(TRIM(cg.modality)) IN ('P', 'PRESENCIAL')
            OR LOWER(TRIM(cg.modality)) LIKE 'pres%')`
        );
      } else if (literal) {
        conditions.push(`cg.modality ILIKE $${i++}`);
        values.push(`%${literal}%`);
      }
    }
    if (type) {
      const normalizedType = type.toLowerCase();
      if (normalizedType === "current") {
        // Sin tabla de “carga actual” separada.
      } else if (normalizedType === "projection") {
        // Todas las filas son proyección ACA.
      }
    }
    if (program) {
      conditions.push(`COALESCE(al.program_name, pr.name, '') ILIKE $${i++}`);
      values.push(`%${program}%`);
    }
    if (subject) {
      conditions.push(
        `(s.name ILIKE $${i} OR al.subject_code ILIKE $${i})`
      );
      values.push(`%${subject}%`);
      i++;
    }
    if (groupCode) {
      conditions.push(`al.group_code ILIKE $${i++}`);
      values.push(`%${groupCode}%`);
    }
    if (acaGroupId) {
      conditions.push(`al.aca_group_id = $${i++}`);
      values.push(acaGroupId);
    }
    if (block) {
      conditions.push(`cg.block ILIKE $${i++}`);
      values.push(`%${block}%`);
    }
    if (
      studyLevel === "pregrado" ||
      studyLevel === "especializacion" ||
      studyLevel === "otro"
    ) {
      conditions.push(`(${SQL_STUDY_LEVEL}) = $${i++}`);
      values.push(studyLevel);
    }

    const schoolScope = schoolScopeFromRequest(req);
    if (schoolScope != null) {
      conditions.push(`(p.school_id = $${i} OR pr.school_id = $${i})`);
      values.push(schoolScope.schoolId);
      i++;
    } else if (schoolId != null) {
      conditions.push(`p.school_id = $${i++}`);
      values.push(schoolId);
    }

    if (areaId != null) {
      conditions.push(
        `COALESCE(p.area_id, sch.area_id) = $${i++}`
      );
      values.push(areaId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        al.id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        COALESCE(al.program_name, pr.name) AS program,
        s.name AS subject_name,
        s.credits_quantity AS credits,
        cg.modality AS modality,
        cg.block AS block,
        al.period_code AS period,
        'projection'::text AS type,
        al.subject_code,
        al.group_code,
        al.aca_group_id,
        (${SQL_STUDY_LEVEL}) AS study_level,
        COUNT(*) OVER() AS total_count
      FROM academic_workload.academic_load al
      INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
      LEFT JOIN program pr ON pr.id = al.program_id
      LEFT JOIN school sch ON sch.id = p.school_id
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      ${where}
      ORDER BY p.full_name ASC NULLS LAST, s.name ASC NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(limitNum, offset);

    const result = await pool.query(query, values);
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

router.get("/academic-load/summary", async (req: Request, res: Response) => {
  try {
    const schoolScope = schoolScopeFromRequest(req);
    const schoolSql = schoolScope
      ? ` AND (p.school_id = $1 OR pr.school_id = $1)`
      : "";
    const params = schoolScope ? [schoolScope.schoolId] : [];
    const result = await pool.query(
      `
      SELECT
        al.period_code AS period,
        'projection'::text AS type,
        COUNT(*)::int AS total_subjects,
        COUNT(DISTINCT al.person_id)::int AS total_teachers
      FROM academic_workload.academic_load al
      INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
      LEFT JOIN program pr ON pr.id = al.program_id
      WHERE 1=1${schoolSql}
      GROUP BY al.period_code
      ORDER BY al.period_code DESC
    `,
      params
    );
    const periods = result.rows.map((row) => row.period).filter(Boolean);
    res.json({
      periods,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic-load/teacher/:document", async (req: Request, res: Response) => {
  try {
    const schoolScope = schoolScopeFromRequest(req);
    const schoolSql = schoolScope
      ? ` AND (p.school_id = $2 OR pr.school_id = $2)`
      : "";
    const params: unknown[] = [req.params.document];
    if (schoolScope) params.push(schoolScope.schoolId);

    const result = await pool.query(
      `
      SELECT
        al.id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        COALESCE(al.program_name, pr.name) AS unit_name,
        COALESCE(al.program_name, pr.name) AS program,
        s.name AS subject_name,
        s.credits_quantity AS credits,
        cg.modality AS modality,
        al.period_code AS period,
        'projection'::text AS type,
        al.subject_code,
        al.group_code,
        al.aca_group_id
      FROM academic_workload.academic_load al
      INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
      LEFT JOIN program pr ON pr.id = al.program_id
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      WHERE p.document = $1${schoolSql}
      ORDER BY al.period_code DESC, s.name ASC
      `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
