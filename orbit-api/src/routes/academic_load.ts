import { Router, Request, Response } from "express";
import { sqlPeriodIsCurrent } from "../sql/currentPeriods";
import { pool } from "../db/connection";
import { sqlPersonIsActive } from "../sql/personActive";
import { schoolScopeFromRequest } from "../middleware/orbitAuth";
import { loadResponsibleIndex } from "../lib/orgResponsible";
import { teamPersonIds } from "../lib/liteScope";
import {
  computeTeacherAlerts,
  parseTeacherAlertKey,
  summarizeAlerts,
  type AlertsSummary,
  type TeacherAlertInfo,
} from "../lib/teacherAlerts";
import {
  DEFAULT_CLASS_PREPARATION_HOURS,
  PLACEHOLDER_SUBSTANTIVE_CATEGORY,
  weeklyContractHoursFromLabels,
} from "../lib/substantiveHours";

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

/**
 * Docente del área de investigación: su ficha está en la escuela
 * INVESTIGACION CUN o en el área investigativa (mismo criterio que Planta).
 */
const SQL_IS_RESEARCH_TEACHER = `(
  UPPER(TRANSLATE(TRIM(COALESCE(sch.name, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN'
  OR EXISTS (
    SELECT 1 FROM area ar_rt
    WHERE ar_rt.id = COALESCE(p.area_id, sch.area_id)
      AND (ar_rt.name ILIKE '%investigativ%'
        OR UPPER(TRANSLATE(TRIM(ar_rt.name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) = 'INVESTIGACION CUN')
  )
)`;

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
  if (ascii === "p") return { code: "P", literal: null };
  if (ascii === "v") return { code: "V", literal: null };
  if (ascii.startsWith("pres")) return { code: "P", literal: null };
  if (ascii.startsWith("vir")) return { code: "V", literal: null };
  return { code: null, literal: trimmed };
}

/**
 * Recorte por usuario (coordinador de escuela o equipo LITE) como ` AND …`
 * sobre `p` (docente) y `pr` (programa de la carga), con parámetros desde `startIdx`.
 */
async function personScopeSql(
  req: Request,
  startIdx: number
): Promise<{ sql: string; params: unknown[] }> {
  const liteTeam = await teamPersonIds(req);
  if (liteTeam != null) {
    return { sql: ` AND p.id = ANY($${startIdx}::bigint[])`, params: [liteTeam] };
  }
  const schoolScope = schoolScopeFromRequest(req);
  if (schoolScope != null) {
    return {
      sql: ` AND (p.school_id = $${startIdx} OR pr.school_id = $${startIdx})`,
      params: [schoolScope.schoolId],
    };
  }
  return { sql: "", params: [] };
}

router.get("/academic-load/filter-options", async (req: Request, res: Response) => {
  try {
    const { sql: schoolSql, params } = await personScopeSql(req, 1);
    /** Pestaña: "only" = investigación; "exclude" = docentes. Sin valor = todas. */
    const research = qStr(req.query.research).toLowerCase();
    const researchSql =
      research === "only"
        ? ` AND ${SQL_IS_RESEARCH_TEACHER}`
        : research === "exclude"
          ? ` AND NOT ${SQL_IS_RESEARCH_TEACHER}`
          : "";

    const [periodsR, blocksR, programsR, schoolsR] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT al.period_code AS period
        FROM academic_workload.academic_load al
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        LEFT JOIN program pr ON pr.id = al.program_id
        WHERE al.period_code IS NOT NULL AND TRIM(al.period_code) <> ''
          AND ${sqlPeriodIsCurrent("al")}${schoolSql}
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
        WHERE cg.block IS NOT NULL AND TRIM(cg.block) <> ''
          AND ${sqlPeriodIsCurrent("al")}${schoolSql}
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
        WHERE COALESCE(NULLIF(TRIM(al.program_name), ''), NULLIF(TRIM(pr.name), ''), NULL) IS NOT NULL
          AND ${sqlPeriodIsCurrent("al")}${schoolSql}
        ORDER BY program ASC
        LIMIT 500
        `,
        params
      ),
      // Escuelas con carga vigente en el alcance del usuario (solo académicas,
      // no todo el catálogo institucional).
      pool.query(
        `
        SELECT DISTINCT sch.id, sch.name
        FROM academic_workload.academic_load al
        INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
        INNER JOIN school sch ON sch.id = p.school_id
        LEFT JOIN program pr ON pr.id = al.program_id
        WHERE ${sqlPeriodIsCurrent("al")}${schoolSql}${researchSql}
        ORDER BY sch.name ASC
        `,
        params
      ),
    ]);

    res.json({
      periods: periodsR.rows.map((r) => String(r.period)).filter(Boolean),
      blocks: blocksR.rows.map((r) => String(r.block)).filter(Boolean),
      programs: programsR.rows.map((r) => String(r.program)).filter(Boolean),
      schools: schoolsR.rows.map((r) => ({ id: Number(r.id), name: String(r.name) })),
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

/**
 * Filtros de Carga Académica (mismos para la tabla y la exportación a Excel).
 * Devuelve el FROM/JOIN/WHERE listo y los valores posicionales usados.
 */
async function buildAcademicLoadFilter(req: Request) {
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
  /** "none" = solo docentes sin responsable en Planta Activa. */
  const responsible = qStr(req.query.responsible).toLowerCase();
  /** "only" = solo docentes de investigación; "exclude" = todos menos ellos. */
  const research = qStr(req.query.research).toLowerCase();

  // Solo periodos vigentes (los terminados hace más de PERIOD_GRACE_DAYS días se ocultan).
  const conditions: string[] = [sqlPeriodIsCurrent("al")];
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
    if (code) {
      conditions.push(
        `(UPPER(TRIM(cg.modality)) = $${i} OR LOWER(TRIM(cg.modality)) LIKE $${i + 1})`
      );
      values.push(code, `${code === "P" ? "pres" : "vir"}%`);
      i += 2;
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

  if (research === "only") conditions.push(SQL_IS_RESEARCH_TEACHER);
  else if (research === "exclude") conditions.push(`NOT ${SQL_IS_RESEARCH_TEACHER}`);

  const liteTeam = await teamPersonIds(req);
  if (liteTeam != null) {
    conditions.push(`p.id = ANY($${i}::bigint[])`);
    values.push(liteTeam);
    i++;
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

  // Responsable = alcanzable desde la raíz del organigrama (igual que Planta).
  const responsibleIndex = await loadResponsibleIndex().catch((err) => {
    console.error("academic-load: responsible index", err);
    return null;
  });
  let hasResponsibleSql = "NULL::boolean";
  if (responsibleIndex) {
    const reachIdx = i++;
    values.push([...responsibleIndex.reachable]);
    hasResponsibleSql = `(p.id = ANY($${reachIdx}::bigint[]))`;
    // Condición constante que solo referencia el parámetro: así cualquier
    // consulta sobre este filtro lo usa (Postgres rechaza parámetros sobrantes).
    conditions.push(`cardinality($${reachIdx}::bigint[]) >= 0`);
    if (responsible === "none") conditions.push(`NOT ${hasResponsibleSql}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinsSql = `
    FROM academic_workload.academic_load al
    INNER JOIN person p ON p.id = al.person_id AND ${sqlPersonIsActive("p")}
    LEFT JOIN program pr ON pr.id = al.program_id
    LEFT JOIN school sch ON sch.id = p.school_id
    LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
    LEFT JOIN academic_workload.class_group cg
      ON cg.subject_code = al.subject_code
     AND cg.group_code = al.group_code`;
  const fromSql = `${joinsSql}
    ${where}`;
  return {
    fromSql,
    joinsSql,
    where,
    values,
    nextIndex: i,
    hasResponsibleSql,
    responsibleIndex,
    period,
    research,
  };
}

router.get("/academic-load", async (req: Request, res: Response) => {
  try {
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limitNum = Math.min(
      500,
      Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100)
    );
    const offset = (pageNum - 1) * limitNum;

    const {
      fromSql,
      where,
      values,
      nextIndex,
      hasResponsibleSql,
      responsibleIndex,
      period,
    } = await buildAcademicLoadFilter(req);
    const filterValues = [...values];
    /** group=teacher: pagina por docente y trae todas sus asignaciones. */
    const groupByTeacher = qStr(req.query.group) === "teacher";
    const alertFilter = parseTeacherAlertKey(req.query.alert);

    // Alertas de todos los docentes del filtro (el panel cuenta el total, no la página).
    // Con `alert`, la lista se restringe a quienes la tienen.
    let alertsByPerson: Map<number, TeacherAlertInfo> | null = null;
    let alertsSummary: AlertsSummary | null = null;
    const scopedValues = [...values];
    let scopedFrom = fromSql;
    if (groupByTeacher || alertFilter) {
      const idsR = await pool.query(`SELECT DISTINCT p.id ${fromSql}`, values);
      alertsByPerson = await computeTeacherAlerts(
        idsR.rows.map((r) => Number(r.id)),
        period || null
      );
      alertsSummary = summarizeAlerts(alertsByPerson.values());
      if (alertFilter) {
        const keep = [...alertsByPerson.entries()]
          .filter(([, info]) => info.alerts.includes(alertFilter))
          .map(([id]) => id);
        scopedValues.push(keep);
        scopedFrom = `${fromSql} ${where ? "AND" : "WHERE"} p.id = ANY($${scopedValues.length}::bigint[])`;
      }
    }
    const scopedWhere = where || scopedFrom !== fromSql;
    let i = scopedValues.length + 1;
    void nextIndex;

    const selectRows = `
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
        p.id AS person_id,
        ${hasResponsibleSql} AS has_responsible`;

    let result: { rows: Record<string, any>[] };
    let total: number;
    if (groupByTeacher) {
      const teachersR = await pool.query(
        `SELECT p.id AS person_id, COUNT(*) OVER() AS total_count
         ${scopedFrom}
         GROUP BY p.id, p.full_name
         ORDER BY ${hasResponsibleSql} ASC NULLS LAST, p.full_name ASC NULLS LAST, p.id
         LIMIT $${i} OFFSET $${i + 1}`,
        [...scopedValues, limitNum, offset]
      );
      total = teachersR.rows.length > 0 ? Number(teachersR.rows[0].total_count) : 0;
      const ids = teachersR.rows.map((r) => Number(r.person_id));
      result = ids.length
        ? await pool.query(
            `${selectRows}
             ${scopedFrom}
             ${scopedWhere ? "AND" : "WHERE"} p.id = ANY($${i}::bigint[])
             ORDER BY array_position($${i}::bigint[], p.id::bigint),
               al.period_code DESC, s.name ASC NULLS LAST, al.group_code`,
            [...scopedValues, ids]
          )
        : { rows: [] };
    } else {
      result = await pool.query(
        `${selectRows},
           COUNT(*) OVER() AS total_count
         ${scopedFrom}
         ORDER BY ${hasResponsibleSql} ASC NULLS LAST,
           p.full_name ASC NULLS LAST, s.name ASC NULLS LAST
         LIMIT $${i} OFFSET $${i + 1}`,
        [...scopedValues, limitNum, offset]
      );
      total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    }
    i += 2;

    // "Sin responsable" sobre el filtro base (el aviso no cambia al elegir una
    // alerta); totales de la lista sobre el filtro con la alerta.
    const [baseR, scopedR] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT p.id) FILTER (WHERE NOT ${hasResponsibleSql})::int AS teachers_without,
           COUNT(*) FILTER (WHERE NOT ${hasResponsibleSql})::int AS rows_without,
           COUNT(*)::int AS rows,
           COUNT(DISTINCT p.id)::int AS teachers
         ${fromSql}`,
        filterValues
      ),
      scopedFrom === fromSql
        ? Promise.resolve(null)
        : pool.query(
            `SELECT COUNT(*)::int AS rows, COUNT(DISTINCT p.id)::int AS teachers
             ${scopedFrom}`,
            scopedValues
          ),
    ]);
    const totalsR = {
      rows: [{ ...baseR.rows[0], ...(scopedR?.rows[0] ?? {}) }],
    };
    const unassignedR = responsibleIndex
      ? { rows: [{ teachers: totalsR.rows[0]?.teachers_without, rows: totalsR.rows[0]?.rows_without }] }
      : null;
    void i;

    // Nombre del responsable directo de cada docente de la página.
    const parentIds = new Set<number>();
    if (responsibleIndex) {
      for (const row of result.rows) {
        const parent = responsibleIndex.parentOf.get(Number(row.person_id));
        if (parent != null) parentIds.add(parent);
      }
    }
    const parentNames = new Map<number, string>();
    if (parentIds.size > 0) {
      const names = await pool.query(
        `SELECT id, full_name FROM person WHERE id = ANY($1::bigint[])`,
        [[...parentIds]]
      );
      for (const r of names.rows) parentNames.set(Number(r.id), String(r.full_name ?? ""));
    }
    const data = result.rows.map((row) => {
      const parent = responsibleIndex?.parentOf.get(Number(row.person_id));
      const { total_count: _total, ...rest } = row;
      return {
        ...rest,
        responsible_name: parent != null ? parentNames.get(parent) ?? null : null,
      };
    });

    res.json({
      data,
      responsible_summary: unassignedR
        ? {
            teachers_without: Number(unassignedR.rows[0]?.teachers ?? 0),
            rows_without: Number(unassignedR.rows[0]?.rows ?? 0),
          }
        : null,
      totals: {
        rows: Number(totalsR.rows[0]?.rows ?? 0),
        teachers: Number(totalsR.rows[0]?.teachers ?? 0),
      },
      grouped_by: groupByTeacher ? "teacher" : null,
      alert: alertFilter,
      alerts_summary: alertsSummary,
      teacher_alerts: alertsByPerson
        ? Object.fromEntries(
            [...new Set(result.rows.map((r) => Number(r.person_id)))]
              .filter((id) => alertsByPerson!.has(id))
              .map((id) => [id, alertsByPerson!.get(id)])
          )
        : null,
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

/**
 * GET /academic-load/export — todo lo necesario para el Excel de Carga
 * Académica cruzado con Balance carga, sin paginar. Mismos filtros que la tabla.
 */
router.get("/academic-load/export", async (req: Request, res: Response) => {
  try {
    const {
      joinsSql,
      where,
      values,
      hasResponsibleSql,
      responsibleIndex,
      period,
      research,
    } = await buildAcademicLoadFilter(req);

    // 1) Filas de carga con todo lo que se puede cruzar.
    const rowsR = await pool.query(
      `SELECT
         al.id,
         p.id AS person_id,
         p.document,
         p.type_document,
         p.full_name,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.phone), '') AS phone,
         r.name AS role_name,
         ar.name AS person_area,
         sch.name AS person_school,
         ppr.name AS person_program,
         ct.name AS contract_type,
         ct.work_schedule,
         ${SQL_IS_RESEARCH_TEACHER} AS is_research,
         ${hasResponsibleSql} AS has_responsible,
         al.period_code,
         al.semester,
         COALESCE(al.program_name, pr.name) AS program,
         (${SQL_STUDY_LEVEL}) AS study_level,
         al.subject_code,
         s.name AS subject_name,
         s.credits_quantity AS credits,
         s.hours_quantity AS subject_hours,
         al.substantive_hours_quantity AS load_hours,
         al.group_code,
         al.aca_group_id,
         al.enrolled_quantity,
         cg.enrolled_quantity AS group_enrolled,
         cg.capacity,
         cg.modality,
         cg.block,
         cg.schedule_type,
         cg.start_date,
         cg.end_date,
         cg.start_time,
         cg.end_time,
         cg.classroom_name,
         cg.level_number,
         cg.curriculum_code,
         cg.track_type,
         rg.name AS region,
         ci.name AS city,
         ca.name AS campus,
         al.created_at,
         al.updated_at
       ${joinsSql}
       LEFT JOIN role r ON r.id = p.role_id
       LEFT JOIN area ar ON ar.id = COALESCE(p.area_id, sch.area_id)
       LEFT JOIN program ppr ON ppr.id = p.program_id
       LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
       LEFT JOIN region rg ON rg.id = al.region_id
       LEFT JOIN city ci ON ci.id = al.city_id
       LEFT JOIN campus ca ON ca.id = al.campus_id
       ${where}
       ORDER BY p.full_name ASC NULLS LAST, al.period_code DESC, s.name ASC NULLS LAST`,
      values
    );

    const loadPersonIds = [...new Set(rowsR.rows.map((r) => Number(r.person_id)))];

    // 2) Docentes sin carga con los mismos filtros de persona (área, escuela,
    //    pestaña): rol docente, o con preparación / horas sustantivas registradas.
    const personValues: unknown[] = [loadPersonIds];
    const personConds: string[] = [
      sqlPersonIsActive("p"),
      `NOT (p.id = ANY($1::bigint[]))`,
      `(
        UPPER(COALESCE(r.name, '')) LIKE 'DOCENTE%'
        OR EXISTS (SELECT 1 FROM substantive_hours.assignment sa WHERE sa.person_id = p.id)
        OR EXISTS (SELECT 1 FROM academic_workload.class_preparation cpx WHERE cpx.person_id = p.id)
      )`,
    ];
    if (research === "only") personConds.push(SQL_IS_RESEARCH_TEACHER);
    else if (research === "exclude") personConds.push(`NOT ${SQL_IS_RESEARCH_TEACHER}`);
    const liteTeam = await teamPersonIds(req);
    if (liteTeam != null) {
      personValues.push(liteTeam);
      personConds.push(`p.id = ANY($${personValues.length}::bigint[])`);
    }
    const schoolScope = schoolScopeFromRequest(req);
    const schoolId = schoolScope?.schoolId ?? parsePositiveInt(req.query.school_id ?? req.query.schoolId);
    if (schoolId != null) {
      personValues.push(schoolId);
      personConds.push(`p.school_id = $${personValues.length}`);
    }
    const areaId = parsePositiveInt(req.query.area_id ?? req.query.areaId);
    if (areaId != null) {
      personValues.push(areaId);
      personConds.push(`COALESCE(p.area_id, sch.area_id) = $${personValues.length}`);
    }
    // Sin carga solo tiene sentido sin filtros de la carga misma (materia, grupo…).
    const loadOnlyFilters = [
      "unit_name", "search", "modality", "program", "subject", "group_code",
      "groupCode", "aca_group_id", "acaGroupId", "block", "study_level",
      "studyLevel", "teacher_document", "responsible",
    ].some((k) => qStr(req.query[k]) !== "");
    const noLoadR = loadOnlyFilters
      ? { rows: [] as Record<string, unknown>[] }
      : await pool.query(
          `SELECT p.id AS person_id, p.document, p.type_document, p.full_name,
             NULLIF(TRIM(p.edu_email), '') AS edu_email, NULLIF(TRIM(p.email), '') AS email,
             NULLIF(TRIM(p.phone), '') AS phone, r.name AS role_name, ar.name AS person_area,
             sch.name AS person_school, ppr.name AS person_program,
             ct.name AS contract_type, ct.work_schedule,
             ${SQL_IS_RESEARCH_TEACHER} AS is_research
           FROM person p
           LEFT JOIN school sch ON sch.id = p.school_id
           LEFT JOIN area ar ON ar.id = COALESCE(p.area_id, sch.area_id)
           LEFT JOIN role r ON r.id = p.role_id
           LEFT JOIN program ppr ON ppr.id = p.program_id
           LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
           WHERE ${personConds.join(" AND ")}
           ORDER BY p.full_name ASC`,
          personValues
        );
    const allPersonIds = [
      ...loadPersonIds,
      ...noLoadR.rows.map((r) => Number(r.person_id)),
    ];

    // 3) Datos de Balance carga por persona (misma regla que el módulo).
    const [prepR, catedraR, byPeriodR, substantiveR, lastRunR] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (person_id) person_id, class_preparation_hours, updated_at
         FROM academic_workload.class_preparation
         WHERE person_id = ANY($1::bigint[])
         ORDER BY person_id, updated_at DESC NULLS LAST, id DESC`,
        [allPersonIds]
      ),
      pool.query(
        `SELECT al.person_id,
           COALESCE(SUM(COALESCE(NULLIF(subj.hours_quantity, 0), NULLIF(al.substantive_hours_quantity, 0), 0)), 0) AS catedra_hours
         FROM academic_workload.academic_load al
         LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
         WHERE al.person_id = ANY($1::bigint[]) AND ${sqlPeriodIsCurrent("al")}${period ? " AND al.period_code = $2" : ""}
         GROUP BY al.person_id`,
        period ? [allPersonIds, period] : [allPersonIds]
      ),
      pool.query(
        `SELECT al.person_id, al.period_code,
           COALESCE(SUM(COALESCE(NULLIF(subj.hours_quantity, 0), NULLIF(al.substantive_hours_quantity, 0), 0)), 0) AS hours,
           COUNT(*)::int AS assignments
         FROM academic_workload.academic_load al
         LEFT JOIN academic_workload.subject subj ON subj.subject_code = al.subject_code
         WHERE al.person_id = ANY($1::bigint[]) AND ${sqlPeriodIsCurrent("al")}
         GROUP BY al.person_id, al.period_code`,
        [allPersonIds]
      ),
      pool.query(
        `SELECT a.id, a.person_id, COALESCE(cat.name, $2) AS category, a.hours_quantity,
           a.created_at, a.updated_at,
           COALESCE((SELECT STRING_AGG(t.description, ' | ' ORDER BY t.sort_order, t.id)
                     FROM substantive_hours.assignment_task t WHERE t.assignment_id = a.id), '') AS tasks
         FROM substantive_hours.assignment a
         LEFT JOIN substantive_hours.category cat ON cat.id = a.category_id
         WHERE a.person_id = ANY($1::bigint[])
         ORDER BY a.person_id, a.created_at`,
        [allPersonIds, PLACEHOLDER_SUBSTANTIVE_CATEGORY]
      ),
      pool
        .query(
          `SELECT fecha_carga, imported_at, source_file, row_count, status, period_codes
           FROM academic_workload.import_run
           WHERE status IS NULL OR status NOT ILIKE '%error%'
           ORDER BY imported_at DESC NULLS LAST LIMIT 1`
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);
    const lastUpdateR = await pool.query(
      `SELECT MAX(COALESCE(updated_at, created_at)) AS last_update FROM academic_workload.academic_load`
    );

    // 4) Responsable directo (nombre y documento) de todos.
    const parentIds = new Set<number>();
    for (const id of allPersonIds) {
      const parent = responsibleIndex?.parentOf.get(id);
      if (parent != null) parentIds.add(parent);
    }
    const parents = new Map<number, { name: string; document: string; role: string }>();
    if (parentIds.size > 0) {
      const pr = await pool.query(
        `SELECT p.id, p.full_name, p.document, r.name AS role_name
         FROM person p LEFT JOIN role r ON r.id = p.role_id WHERE p.id = ANY($1::bigint[])`,
        [[...parentIds]]
      );
      for (const r of pr.rows) {
        parents.set(Number(r.id), {
          name: String(r.full_name ?? ""),
          document: String(r.document ?? ""),
          role: String(r.role_name ?? ""),
        });
      }
    }
    const responsibleOf = (personId: number) => {
      if (!responsibleIndex) return { status: null as string | null, name: "", document: "", role: "" };
      if (!responsibleIndex.reachable.has(personId)) {
        return { status: "Sin responsable", name: "", document: "", role: "" };
      }
      const parent = responsibleIndex.parentOf.get(personId);
      const info = parent != null ? parents.get(parent) : undefined;
      return { status: "Con responsable", name: info?.name ?? "", document: info?.document ?? "", role: info?.role ?? "" };
    };

    const prepBy = new Map(prepR.rows.map((r) => [Number(r.person_id), Number(r.class_preparation_hours)]));
    const catedraBy = new Map(catedraR.rows.map((r) => [Number(r.person_id), Number(r.catedra_hours) || 0]));
    const substantiveBy = new Map<number, number>();
    for (const r of substantiveR.rows) {
      const id = Number(r.person_id);
      substantiveBy.set(id, (substantiveBy.get(id) ?? 0) + (Number(r.hours_quantity) || 0));
    }

    const balanceOf = (personId: number, contractType: unknown, workSchedule: unknown) => {
      const contractHours = weeklyContractHoursFromLabels(
        workSchedule == null ? null : String(workSchedule),
        contractType == null ? null : String(contractType)
      );
      const prepRegistered = prepBy.has(personId);
      const preparationHours = prepRegistered ? prepBy.get(personId)! : DEFAULT_CLASS_PREPARATION_HOURS;
      const catedraHours = catedraBy.get(personId) ?? 0;
      const substantiveHours = substantiveBy.get(personId) ?? 0;
      const difference =
        contractHours != null ? contractHours - catedraHours - preparationHours - substantiveHours : null;
      return {
        contract_hours: contractHours,
        catedra_hours: catedraHours,
        preparation_hours: preparationHours,
        preparation_registered: prepRegistered,
        substantive_hours: substantiveHours,
        available_hours: difference == null ? null : Math.max(0, difference),
        difference,
        balance_status:
          difference == null
            ? "Sin jornada definida"
            : difference > 0
              ? "Con disponibilidad"
              : difference === 0
                ? "Sin disponibilidad"
                : "Sobrecarga",
      };
    };

    // Agrega por docente lo que está en la carga filtrada.
    type Agg = { base: Record<string, unknown>; assignments: number; groups: Set<string>; subjects: Set<string>;
      credits: number; enrolled: number; periods: Set<string>; programs: Set<string> };
    const aggs = new Map<number, Agg>();
    for (const r of rowsR.rows) {
      const id = Number(r.person_id);
      let a = aggs.get(id);
      if (!a) {
        a = { base: r, assignments: 0, groups: new Set(), subjects: new Set(), credits: 0, enrolled: 0, periods: new Set(), programs: new Set() };
        aggs.set(id, a);
      }
      a.assignments += 1;
      a.groups.add(`${r.period_code}|${r.subject_code}|${r.group_code}`);
      if (r.subject_code) a.subjects.add(String(r.subject_code));
      a.credits += Number(r.credits) || 0;
      a.enrolled += Number(r.enrolled_quantity) || 0;
      if (r.period_code) a.periods.add(String(r.period_code));
      if (r.program) a.programs.add(String(r.program));
    }

    const personFields = (r: Record<string, unknown>) => ({
      person_id: Number(r.person_id),
      document: r.document ?? "",
      type_document: r.type_document ?? "",
      full_name: r.full_name ?? "",
      edu_email: r.edu_email ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      role_name: r.role_name ?? "",
      person_area: r.person_area ?? "",
      person_school: r.person_school ?? "",
      person_program: r.person_program ?? "",
      contract_type: r.contract_type ?? "",
      work_schedule: r.work_schedule ?? "",
      is_research: r.is_research === true,
    });

    const teachers = [...aggs.entries()].map(([id, a]) => {
      const resp = responsibleOf(id);
      return {
        ...personFields(a.base),
        responsible_status: resp.status,
        responsible_name: resp.name,
        responsible_document: resp.document,
        responsible_role: resp.role,
        ...balanceOf(id, a.base.contract_type, a.base.work_schedule),
        assignments: a.assignments,
        groups: a.groups.size,
        subjects: a.subjects.size,
        credits: a.credits,
        enrolled: a.enrolled,
        periods: [...a.periods].sort().join(", "),
        programs: [...a.programs].sort().join(" | "),
      };
    });

    const withoutLoad = noLoadR.rows.map((r) => {
      const id = Number(r.person_id);
      const resp = responsibleOf(id);
      return {
        ...personFields(r),
        responsible_status: resp.status,
        responsible_name: resp.name,
        responsible_document: resp.document,
        responsible_role: resp.role,
        ...balanceOf(id, r.contract_type, r.work_schedule),
      };
    });

    const rows = rowsR.rows.map((r) => {
      const resp = responsibleOf(Number(r.person_id));
      return {
        ...r,
        responsible_status: resp.status,
        responsible_name: resp.name,
        responsible_document: resp.document,
      };
    });

    const nameOf = new Map<number, { name: string; document: string }>();
    for (const t of [...teachers, ...withoutLoad]) {
      nameOf.set(t.person_id, { name: String(t.full_name), document: String(t.document) });
    }

    res.json({
      generated_at: new Date().toISOString(),
      period: period || null,
      research: research || null,
      last_import: lastRunR.rows[0] ?? null,
      last_load_update: lastUpdateR.rows[0]?.last_update ?? null,
      responsible_available: responsibleIndex != null,
      rows,
      teachers,
      without_load: withoutLoad,
      catedra_by_period: byPeriodR.rows.map((r) => ({
        person_id: Number(r.person_id),
        period_code: String(r.period_code ?? ""),
        hours: Number(r.hours) || 0,
        assignments: Number(r.assignments) || 0,
      })),
      substantive: substantiveR.rows.map((r) => ({
        id: Number(r.id),
        person_id: Number(r.person_id),
        full_name: nameOf.get(Number(r.person_id))?.name ?? "",
        document: nameOf.get(Number(r.person_id))?.document ?? "",
        category: String(r.category ?? ""),
        hours: Number(r.hours_quantity) || 0,
        tasks: String(r.tasks ?? ""),
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  } catch (err) {
    console.error("GET /academic-load/export", err);
    res.status(500).json({ error: "Error al generar la exportación" });
  }
});

router.get("/academic-load/summary", async (req: Request, res: Response) => {
  try {
    const { sql: schoolSql, params } = await personScopeSql(req, 1);
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
      WHERE ${sqlPeriodIsCurrent("al")}${schoolSql}
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
    const scope = await personScopeSql(req, 2);
    const schoolSql = scope.sql;
    const params: unknown[] = [req.params.document, ...scope.params];

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
      WHERE p.document = $1 AND ${sqlPeriodIsCurrent("al")}${schoolSql}
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
