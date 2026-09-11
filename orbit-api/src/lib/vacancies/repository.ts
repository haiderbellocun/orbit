import { pool } from "../../db/connection";
import { qualifiedCoreTable, type CoreSchemaMode } from "../coreSchema";
import {
  FULLY_LOCKED_STATUSES,
  isUuid,
  REQUISITION_BLOCKED_STATUSES,
} from "./rules";

export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

/** Tablas del catálogo CORE resueltas una sola vez por request. */
export type CoreTables = {
  area: string;
  school: string;
  program: string;
  person: string;
};

export function coreTables(mode: CoreSchemaMode): CoreTables {
  return {
    area: qualifiedCoreTable(mode, "area"),
    school: qualifiedCoreTable(mode, "school"),
    program: qualifiedCoreTable(mode, "program"),
    person: qualifiedCoreTable(mode, "person"),
  };
}

/** Cumplimientos almacenados en vacancies.requisition (LEFT JOIN en listados). */
const SQL_REQUISITION_COMPLIANCE = `
         r.shortlist_complied,
         r.pda_complied,
         r.contract_conditions_complied,
         r.pre_interview_cv_complied`;

export function sqlOperationNotesAgg(personTable: string): string {
  return `(
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', n.id::text,
          'text', n.body,
          'createdAt', n.created_at,
          'createdByPersonId', n.created_by_person_id,
          'createdByName', per.full_name
        )
        ORDER BY n.created_at ASC
      ),
      '[]'::json
    )
    FROM vacancies.vacancy_operation_note n
    LEFT JOIN ${personTable} per ON per.id = n.created_by_person_id
    WHERE n.vacancy_id = v.id
  )`;
}

/**
 * SELECT canónico de vacantes con área, escuela, programa, notas y requisición.
 *
 * Es la forma que consumen `mapListRow` y `mapRequisition`; antes estaba copiado
 * en seis rutas. `withRequisitionIds` añade las columnas que solo necesita el
 * detalle (GET /vacancies/:id).
 */
export function vacancySelectSql(
  tables: CoreTables,
  opts: { where: string; orderBy?: string; withRequisitionIds?: boolean }
): string {
  const requisitionIds = opts.withRequisitionIds
    ? `
         r.id AS requisition_id,
         r.public_id AS requisition_public_id,`
    : "";
  return `SELECT
         v.id,
         v.public_id,
         v.area_id,
         a.name AS area_name,
         v.school_id,
         s.name AS school_name,
         v.program_id,
         p.name AS program_name,
         v.position_name,
         v.curricular_line,
         v.quantity,
         v.hired_quantity,
         v.operation_status,
         ${sqlOperationNotesAgg(tables.person)} AS operation_notes_json,
         ${SQL_REQUISITION_COMPLIANCE},
         v.created_at,
         v.updated_at,
         v.closed_at,
         v.direct_manager_identification,${requisitionIds}
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at,
         r.capital_notes AS requisition_capital_notes
       FROM vacancies.vacancy v
       JOIN ${tables.area} a ON a.id = v.area_id
       LEFT JOIN ${tables.school} s ON s.id = v.school_id
       LEFT JOIN ${tables.program} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       ${opts.where}
       ${opts.orderBy ?? ""}`;
}

/** Fila completa de una vacante, ya con joins y notas. */
export async function loadVacancyRow(
  tables: CoreTables,
  vacancyId: string,
  opts?: { withRequisitionIds?: boolean }
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    vacancySelectSql(tables, {
      where: "WHERE v.id = $1",
      withRequisitionIds: opts?.withRequisitionIds,
    }),
    [vacancyId]
  );
  return rows.length === 0 ? null : (rows[0] as Record<string, unknown>);
}

/** Listado completo, acotado a la escuela del usuario cuando aplica. */
export async function loadVacancyList(
  tables: CoreTables,
  schoolId: number | null
): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    vacancySelectSql(tables, {
      where: schoolId != null ? "WHERE v.school_id = $1" : "",
      orderBy: "ORDER BY v.created_at DESC",
    }),
    schoolId != null ? [schoolId] : []
  );
  return rows as Record<string, unknown>[];
}

/** Acepta el UUID o el `public_id` numérico expuesto en listados. */
export async function resolveVacancyUuidFromParam(
  vacancyParam: string
): Promise<string | null> {
  const raw = String(vacancyParam ?? "").trim();
  if (isUuid(raw)) return raw;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    const { rows } = await pool.query(
      `SELECT id FROM vacancies.vacancy WHERE public_id = $1 OR id::text = $2`,
      [n, raw]
    );
    if (rows.length === 0) return null;
    return String((rows[0] as { id: unknown }).id);
  }

  return null;
}

export async function loadVacancyOperationStatus(
  vacancyId: string
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT operation_status FROM vacancies.vacancy WHERE id = $1`,
    [vacancyId]
  );
  if (rows.length === 0) return null;
  return String((rows[0] as { operation_status?: unknown }).operation_status ?? "");
}

export type VacancyCounters = {
  quantity: number;
  hiredQuantity: number;
  operationStatus: string;
};

export async function loadVacancyCounters(
  vacancyId: string
): Promise<VacancyCounters | null> {
  const { rows } = await pool.query(
    `SELECT quantity, hired_quantity, operation_status
     FROM vacancies.vacancy WHERE id = $1`,
    [vacancyId]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    quantity: Number(row.quantity ?? 0),
    hiredQuantity: Number(row.hired_quantity ?? 0),
    operationStatus: String(row.operation_status ?? ""),
  };
}

export async function loadSchoolArea(
  mode: CoreSchemaMode,
  schoolId: number
): Promise<{ areaId: number | null } | null> {
  const { rows } = await pool.query(
    `SELECT area_id
     FROM ${qualifiedCoreTable(mode, "school")}
     WHERE id = $1 AND COALESCE(is_active, true) = true`,
    [schoolId]
  );
  if (rows.length === 0) return null;
  return { areaId: (rows[0] as { area_id: number | null }).area_id };
}

export async function loadProgramSchoolArea(
  mode: CoreSchemaMode,
  programId: number
): Promise<{ schoolId: number; areaId: number | null } | null> {
  const { rows } = await pool.query(
    `SELECT p.school_id, s.area_id
     FROM ${qualifiedCoreTable(mode, "program")} p
     JOIN ${qualifiedCoreTable(mode, "school")} s ON s.id = p.school_id
     WHERE p.id = $1 AND COALESCE(p.is_active, true) = true`,
    [programId]
  );
  if (rows.length === 0) return null;
  const r = rows[0] as { school_id: number; area_id: number | null };
  return { schoolId: r.school_id, areaId: r.area_id };
}

/** `null` si la vacante existe y admite edición. */
export async function vacancyEditGate(
  vacancyId: string
): Promise<import("./rules").VacancyEditGate> {
  const status = await loadVacancyOperationStatus(vacancyId);
  if (status == null) return "missing";
  return FULLY_LOCKED_STATUSES.has(status) ? "blocked" : null;
}

/** `null` si la requisición de la vacante admite edición (permitido en `hired`). */
export async function requisitionEditGate(
  vacancyId: string
): Promise<import("./rules").VacancyEditGate> {
  const status = await loadVacancyOperationStatus(vacancyId);
  if (status == null) return "missing";
  return REQUISITION_BLOCKED_STATUSES.has(status) ? "blocked" : null;
}
