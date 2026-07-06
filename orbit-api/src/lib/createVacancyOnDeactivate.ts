import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
  type CoreSchemaMode,
} from "./coreSchema";
import { toUpperAscii, toUpperAsciiOrNull } from "./textNormalize";
import { notifyVacancyCreated } from "../services/vacancyNotifyService";

async function vacanciesTableExists(): Promise<boolean> {
  const r = await pool.query(`SELECT to_regclass('vacancies.vacancy') AS t`);
  return r.rows[0]?.t != null;
}

async function loadProgramSchoolArea(
  mode: CoreSchemaMode,
  programId: number
): Promise<{ schoolId: number; areaId: number | null } | null> {
  const programT = qualifiedCoreTable(mode, "program");
  const schoolT = qualifiedCoreTable(mode, "school");
  const { rows } = await pool.query(
    `SELECT p.school_id, s.area_id
     FROM ${programT} p
     JOIN ${schoolT} s ON s.id = p.school_id
     WHERE p.id = $1 AND COALESCE(p.is_active, true) = true`,
    [programId]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { school_id: number; area_id: number | null };
  return { schoolId: row.school_id, areaId: row.area_id };
}

/** Misma definición que GET /coordinators (perfil académico nivel 3). */
function academicAreaSql(areaAlias: string): string {
  return `(
    ${areaAlias}.name ILIKE '%ÁREA ACÁDEMICA%' OR
    ${areaAlias}.name ILIKE '%AREA ACADEMICA%' OR
    ${areaAlias}.name ILIKE '%ACÁDEMICA%' OR
    ${areaAlias}.name ILIKE '%ACADEMICA%'
  )`;
}

function academicCoordinatorRoleSql(roleAlias: string): string {
  return `(
    LOWER(COALESCE(${roleAlias}.category, ${roleAlias}.code, '')) LIKE '%acad%' OR
    ${roleAlias}.name ILIKE 'COORDINADOR%' OR
    ${roleAlias}.code ILIKE 'COORDINADOR%'
  )`;
}

/** Indica si la persona cumple criterios de coordinador académico (sin filtrar is_active). */
export async function personMatchesAcademicCoordinator(
  personId: number
): Promise<boolean> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return false;
  const prefix = mode === "core" ? "core." : "public.";
  const { rows } = await pool.query(
    `SELECT 1
     FROM ${prefix}person p
     LEFT JOIN ${prefix}school s ON s.id = p.school_id
     LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
     LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
     LEFT JOIN ${prefix}role r ON r.id = p.role_id
     WHERE p.id = $1
       AND ${academicAreaSql("a")}
       AND h.level = 3
       AND ${academicCoordinatorRoleSql("r")}`,
    [personId]
  );
  return rows.length > 0;
}

export type AutoVacancyOnDeactivateInput = {
  personId: number;
  positionName: string;
  effectiveProgramId: number | null;
  curricularLine: string | null;
  personFullName: string | null;
};

/**
 * Crea una fila en vacancies.vacancy al inhabilitar una persona.
 * Omite inserción si faltan datos obligatorios (área/escuela) o el catálogo CORE/vacantes no está disponible.
 */
export async function insertAutoVacancyOnDeactivate(
  input: AutoVacancyOnDeactivateInput
): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return;
  if (!(await vacanciesTableExists())) return;

  const prefix = mode === "core" ? "core." : "public.";
  const personT = `${prefix}person`;
  const schoolT = `${prefix}school`;

  const base = await pool.query(
    `SELECT
       p.school_id,
       p.program_id,
       p.area_id AS person_area_id,
       sch.area_id AS school_area_id,
       p.full_name
     FROM ${personT} p
     LEFT JOIN ${schoolT} sch ON sch.id = p.school_id
     WHERE p.id = $1`,
    [input.personId]
  );
  if (base.rows.length === 0) return;

  const row = base.rows[0] as {
    school_id: number | null;
    program_id: number | null;
    person_area_id: number | null;
    school_area_id: number | null;
    full_name?: string | null;
  };

  let schoolId: number | null =
    row.school_id != null && Number.isFinite(Number(row.school_id))
      ? Number(row.school_id)
      : null;
  let areaId: number | null =
    row.school_area_id != null && Number.isFinite(Number(row.school_area_id))
      ? Number(row.school_area_id)
      : row.person_area_id != null && Number.isFinite(Number(row.person_area_id))
        ? Number(row.person_area_id)
        : null;

  let programId: number | null = null;
  const pid = input.effectiveProgramId;
  if (pid != null && Number.isFinite(pid)) {
    const ctx = await loadProgramSchoolArea(mode, pid);
    if (ctx != null) {
      programId = pid;
      schoolId = ctx.schoolId;
      if (ctx.areaId != null) {
        areaId = ctx.areaId;
      }
    }
  }

  if (areaId == null) {
    areaId =
      row.school_area_id != null && Number.isFinite(Number(row.school_area_id))
        ? Number(row.school_area_id)
        : row.person_area_id != null && Number.isFinite(Number(row.person_area_id))
          ? Number(row.person_area_id)
          : null;
  }

  if (schoolId == null || areaId == null) {
    console.warn(
      "insertAutoVacancyOnDeactivate: sin school_id/area_id resolvible; no se crea vacante.",
      { personId: input.personId, positionName: input.positionName }
    );
    return;
  }

  const name =
    input.personFullName ??
    (row.full_name != null ? String(row.full_name) : "");
  const operationNotes = toUpperAscii(
    name !== ""
      ? `Autogenerada al inhabilitar a ${name} (persona id ${input.personId}).`
      : `Autogenerada al inhabilitar persona id ${input.personId}.`
  );

  const ins = await pool.query(
    `INSERT INTO vacancies.vacancy (
      area_id, school_id, program_id,
      position_name, curricular_line, quantity,
      operation_status
    ) VALUES (
      $1, $2, $3,
      $4, $5, 1,
      'open'
    ) RETURNING id`,
    [
      areaId,
      schoolId,
      programId,
      toUpperAscii(input.positionName.trim() || "VACANTE"),
      toUpperAsciiOrNull(input.curricularLine),
    ]
  );
  const vacancyId = String((ins.rows[0] as { id: unknown }).id);
  try {
    await pool.query(
      `INSERT INTO vacancies.vacancy_operation_note
        (vacancy_id, body, created_by_person_id)
       VALUES ($1, $2, $3)`,
      [vacancyId, operationNotes, input.personId]
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") {
      console.warn(
        "insertAutoVacancyOnDeactivate: vacancy_operation_note no existe; ejecute migrate:vacancies."
      );
      return;
    }
    throw e;
  }

  let areaName = "";
  if (areaId != null) {
    const areaT = qualifiedCoreTable(mode, "area");
    const an = await pool.query(
      `SELECT name FROM ${areaT} WHERE id = $1`,
      [areaId]
    );
    areaName = an.rows[0]?.name != null ? String(an.rows[0].name) : "";
  }

  let schoolName: string | null = null;
  let programName: string | null = null;
  if (schoolId != null) {
    const schoolT = qualifiedCoreTable(mode, "school");
    const sn = await pool.query(
      `SELECT name FROM ${schoolT} WHERE id = $1`,
      [schoolId]
    );
    schoolName =
      sn.rows[0]?.name != null ? String(sn.rows[0].name) : null;
  }
  if (programId != null) {
    const programT = qualifiedCoreTable(mode, "program");
    const pn = await pool.query(
      `SELECT name FROM ${programT} WHERE id = $1`,
      [programId]
    );
    programName =
      pn.rows[0]?.name != null ? String(pn.rows[0].name) : null;
  }

  const createdAt = new Date().toISOString();
  void notifyVacancyCreated({
    vacancyId,
    positionName: toUpperAscii(input.positionName.trim() || "VACANTE"),
    areaName,
    schoolName,
    programName,
    quantity: 1,
    createdAt,
  }).catch((err) => {
    console.error("insertAutoVacancyOnDeactivate notify failed:", err);
  });
}
