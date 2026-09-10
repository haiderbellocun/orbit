import { Router, Request, Response } from "express";
import { pool } from "../db/connection";
import { sqlPersonIsActive } from "../sql/personActive";
import { sqlExcludeHarveyFromAcademicLoad } from "../sql/excludeHarveyArea";
import {
  orbitAreaScopeFromRequest,
  orbitCoordinationSchoolIdFromRequest,
  liteTeacherScopeFromRequest,
  schoolScopeFromRequest,
} from "../middleware/orbitAuth";
import { weeklyContractHoursFromLabels } from "../lib/substantiveHours";
import {
  evaluateWorkloadQuota,
  quotaApiFields,
  sqlGroupIsPresencial,
  sqlGroupIsVirtual,
  sqlQuotaLoadIndexExpr,
  sqlQuotaStatusExpr,
} from "../lib/workloadQuota";

const router = Router();

function academicSchoolScope(req: Request): { schoolId: number } | null {
  const regular = schoolScopeFromRequest(req);
  if (regular != null) return regular;
  const schoolId = orbitCoordinationSchoolIdFromRequest(req);
  return schoolId == null ? null : { schoolId };
}

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function qStr(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** La carga histórica puede traer solo program_name aunque program_id sea null. */
function sqlAcademicLoadInPrograms(alias: string, placeholder: string): string {
  return `(
    ${alias}.program_id = ANY(${placeholder}::int[])
    OR LOWER(TRIM(COALESCE(${alias}.program_name, ''))) IN (
      SELECT LOWER(TRIM(scope_program.name))
      FROM program scope_program
      WHERE scope_program.id = ANY(${placeholder}::int[])
    )
  )`;
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

const CONTRACT_HOURS_SQL = `
  CASE
    WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
      ~ '(medio|media|medio[[:space:]]*tiempo|1/2|[[:<:]]21[[:>:]])' THEN 21
    WHEN lower(coalesce(ct.work_schedule, '') || ' ' || coalesce(ct.name, ''))
      ~ '(tiempo[[:space:]]*completo|[[:<:]]completo[[:>:]]|[[:<:]]full[[:>:]]|[[:<:]]42[[:>:]])' THEN 42
    ELSE NULL
  END
`;

function parseTeachingModalityParam(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "presencial" || v === "virtual" || v === "mixto") return v;
  return null;
}

function parseQuotaStatusParam(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "under" || v === "ok" || v === "over" || v === "unknown") return v;
  return null;
}

function buildAcademicLoadFilters(
  req: Request,
  options?: { includeGroupModality?: boolean }
): { conditions: string[]; values: unknown[]; i: number } {
  const includeGroupModality = options?.includeGroupModality !== false;
  const teacherDocument = qStr(req.query.teacher_document);
  const personId = parsePositiveInt(req.query.person_id ?? req.query.personId);
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

  if (personId != null) {
    conditions.push(`al.person_id = $${i++}`);
    values.push(personId);
  }
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
  if (includeGroupModality && modality) {
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
    conditions.push(`(s.name ILIKE $${i} OR al.subject_code ILIKE $${i})`);
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

  const schoolScope = academicSchoolScope(req);
  const liteScope = liteTeacherScopeFromRequest(req);
  const orbitAreaScope = orbitAreaScopeFromRequest(req);
  if (schoolScope != null) {
    conditions.push(`(p.school_id = $${i} OR pr.school_id = $${i})`);
    values.push(schoolScope.schoolId);
    i++;
  } else if (schoolId != null) {
    conditions.push(`p.school_id = $${i++}`);
    values.push(schoolId);
  }

  if (areaId != null) {
    conditions.push(`COALESCE(p.area_id, sch.area_id) = $${i++}`);
    values.push(areaId);
  }

  if (liteScope != null) {
    conditions.push(sqlAcademicLoadInPrograms('al', `$${i++}`));
    values.push(liteScope.programIds);
  }
  if (orbitAreaScope != null) {
    conditions.push(`COALESCE(p.area_id, sch.area_id) = ANY($${i++}::int[])`);
    values.push(orbitAreaScope);
  }

  conditions.push(sqlExcludeHarveyFromAcademicLoad("a"));

  return { conditions, values, i };
}

router.get("/academic-load/filter-options", async (req: Request, res: Response) => {
  try {
    const schoolScope = academicSchoolScope(req);
    const liteScope = liteTeacherScopeFromRequest(req);
    const areaScope = orbitAreaScopeFromRequest(req);
    const params: unknown[] = [];
    let scopeSql = "";
    if (schoolScope) {
      params.push(schoolScope.schoolId);
      scopeSql += ` AND (p.school_id = $${params.length} OR pr.school_id = $${params.length})`;
    }
    if (areaScope != null) {
      params.push(areaScope);
      scopeSql += ` AND COALESCE(p.area_id, sch.area_id) = ANY($${params.length}::int[])`;
    }
    if (liteScope != null) {
      params.push(liteScope.programIds);
      scopeSql += ` AND ${sqlAcademicLoadInPrograms('al', `$${params.length}`)}`;
    }

    const [periodsR, blocksR, programsR] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT al.period_code AS period
        FROM academic_workload.academic_load al
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        LEFT JOIN program pr ON pr.id = al.program_id
        LEFT JOIN school sch ON sch.id = p.school_id
        LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
        WHERE al.period_code IS NOT NULL AND TRIM(al.period_code) <> ''
          AND ${sqlExcludeHarveyFromAcademicLoad("a")}${scopeSql}
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
        LEFT JOIN school sch ON sch.id = p.school_id
        LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
        WHERE cg.block IS NOT NULL AND TRIM(cg.block) <> ''
          AND ${sqlExcludeHarveyFromAcademicLoad("a")}${scopeSql}
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
        LEFT JOIN school sch ON sch.id = p.school_id
        LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
        WHERE COALESCE(NULLIF(TRIM(al.program_name), ''), NULLIF(TRIM(pr.name), ''), NULL) IS NOT NULL
          AND ${sqlExcludeHarveyFromAcademicLoad("a")}${scopeSql}
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

    const { conditions, values, i: startI } = buildAcademicLoadFilters(req);
    let i = startI;
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        al.id,
        al.person_id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        COALESCE(al.program_name, pr.name) AS program,
        s.name AS subject_name,
        s.credits_quantity AS credits,
        s.hours_quantity AS subject_hours,
        al.enrolled_quantity,
        al.semester,
        al.substantive_hours_quantity,
        cg.modality AS modality,
        cg.block AS block,
        cg.capacity AS group_capacity,
        cg.start_date AS group_start_date,
        cg.end_date AS group_end_date,
        cg.start_time AS group_start_time,
        cg.end_time AS group_end_time,
        cg.classroom_name,
        cg.schedule_type,
        camp.name AS campus_name,
        city.name AS city_name,
        reg.name AS region_name,
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
      LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      LEFT JOIN campus camp ON camp.id = al.campus_id
      LEFT JOIN city ON city.id = al.city_id
      LEFT JOIN region reg ON reg.id = al.region_id
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

router.get("/academic-load/teacher-summaries", async (req: Request, res: Response) => {
  try {
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limitNum = Math.min(
      500,
      Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100)
    );
    const offset = (pageNum - 1) * limitNum;

    const { conditions, values, i: startI } = buildAcademicLoadFilters(req, {
      includeGroupModality: Boolean(qStr(req.query.modality)),
    });
    let i = startI;
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const teachingModalityFilter = parseTeachingModalityParam(
      req.query.teaching_modality ?? req.query.teachingModality
    );
    const quotaStatusFilter = parseQuotaStatusParam(
      req.query.quota_status ?? req.query.quotaStatus
    );

    const creditsPExpr = `COALESCE(SUM(CASE WHEN ${sqlGroupIsPresencial("cg")} THEN COALESCE(s.credits_quantity, 0) ELSE 0 END), 0)`;
    const studentsVExpr = `COALESCE(SUM(CASE WHEN ${sqlGroupIsVirtual("cg")} THEN COALESCE(al.enrolled_quantity, 0) ELSE 0 END), 0)`;
    const hasPExpr = `COALESCE(BOOL_OR(${sqlGroupIsPresencial("cg")}), false)`;
    const hasVExpr = `COALESCE(BOOL_OR(${sqlGroupIsVirtual("cg")}), false)`;
    const loadIndexExpr = sqlQuotaLoadIndexExpr({
      contractHoursExpr: `(${CONTRACT_HOURS_SQL})`,
      creditsPExpr,
      studentsVExpr,
      hasPExpr,
      hasVExpr,
    });

    const having: string[] = [];
    if (teachingModalityFilter === "presencial") {
      having.push(`${hasPExpr} AND NOT ${hasVExpr}`);
    } else if (teachingModalityFilter === "virtual") {
      having.push(`${hasVExpr} AND NOT ${hasPExpr}`);
    } else if (teachingModalityFilter === "mixto") {
      having.push(`${hasPExpr} AND ${hasVExpr}`);
    }
    if (quotaStatusFilter != null) {
      having.push(`(${sqlQuotaStatusExpr(loadIndexExpr)}) = $${i++}`);
      values.push(quotaStatusFilter);
    }
    const havingSql = having.length ? `HAVING ${having.join(" AND ")}` : "";

    const query = `
      SELECT
        p.id AS person_id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        a.name AS area,
        sch.name AS school,
        ct.name AS contract_type,
        ct.work_schedule,
        ${creditsPExpr} AS credits_p,
        ${studentsVExpr} AS students_v,
        ${hasPExpr} AS has_p,
        ${hasVExpr} AS has_v,
        COUNT(*)::int AS assignment_count,
        COUNT(*) OVER() AS total_count
      FROM academic_workload.academic_load al
      INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
      LEFT JOIN program pr ON pr.id = al.program_id
      LEFT JOIN school sch ON sch.id = p.school_id
      LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
      LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      ${where}
      GROUP BY
        p.id, p.document, p.full_name, a.name, sch.name,
        ct.name, ct.work_schedule
      ${havingSql}
      ORDER BY p.full_name ASC NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(limitNum, offset);

    const result = await pool.query(query, values);
    const total =
      result.rows.length > 0 ? parseInt(String(result.rows[0].total_count), 10) : 0;

    const data = result.rows.map((r) => {
      const contractHours = weeklyContractHoursFromLabels(
        r.work_schedule as string | null,
        r.contract_type as string | null
      );
      const quota = evaluateWorkloadQuota({
        contractHours,
        creditsP: Number(r.credits_p) || 0,
        studentsV: Number(r.students_v) || 0,
        hasP: Boolean(r.has_p),
        hasV: Boolean(r.has_v),
      });
      return {
        personId: Number(r.person_id),
        document: r.teacher_document != null ? String(r.teacher_document) : "",
        name: r.teacher_name != null ? String(r.teacher_name) : "",
        area: r.area != null ? String(r.area) : "",
        school: r.school != null ? String(r.school) : "",
        contractType: r.contract_type != null ? String(r.contract_type) : "",
        workSchedule: r.work_schedule != null ? String(r.work_schedule) : "",
        contractHoursWeekly: contractHours,
        assignmentCount: Number(r.assignment_count) || 0,
        ...quotaApiFields(quota),
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
    console.error("GET /academic-load/teacher-summaries", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic-load/summary", async (req: Request, res: Response) => {
  try {
    const schoolScope = academicSchoolScope(req);
    const liteScope = liteTeacherScopeFromRequest(req);
    const areaScope = orbitAreaScopeFromRequest(req);
    const params: unknown[] = [];
    let scopeSql = "";
    if (schoolScope) {
      params.push(schoolScope.schoolId);
      scopeSql += ` AND (p.school_id = $${params.length} OR pr.school_id = $${params.length})`;
    }
    if (areaScope != null) {
      params.push(areaScope);
      scopeSql += ` AND COALESCE(p.area_id, sch.area_id) = ANY($${params.length}::int[])`;
    }
    if (liteScope != null) {
      params.push(liteScope.programIds);
      scopeSql += ` AND ${sqlAcademicLoadInPrograms('al', `$${params.length}`)}`;
    }
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
      LEFT JOIN school sch ON sch.id = p.school_id
      LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
      WHERE ${sqlExcludeHarveyFromAcademicLoad("a")}${scopeSql}
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
    const schoolScope = academicSchoolScope(req);
    const liteScope = liteTeacherScopeFromRequest(req);
    const params: unknown[] = [req.params.document];
    let scopeSql = "";
    if (schoolScope) {
      params.push(schoolScope.schoolId);
      scopeSql += ` AND (p.school_id = $${params.length} OR pr.school_id = $${params.length})`;
    }
    const areaScope = orbitAreaScopeFromRequest(req);
    if (areaScope != null) {
      params.push(areaScope);
      scopeSql += ` AND COALESCE(p.area_id, sch.area_id) = ANY($${params.length}::int[])`;
    }
    if (liteScope != null) {
      params.push(liteScope.programIds);
      scopeSql += ` AND ${sqlAcademicLoadInPrograms('al', `$${params.length}`)}`;
    }

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
      LEFT JOIN school sch ON sch.id = p.school_id
      LEFT JOIN area a ON a.id = COALESCE(p.area_id, sch.area_id)
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      WHERE p.document = $1
        AND ${sqlExcludeHarveyFromAcademicLoad("a")}${scopeSql}
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
