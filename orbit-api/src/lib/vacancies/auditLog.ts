import { pool } from "../../db/connection";
import { resolveCoreSchemaMode } from "../coreSchema";
import { coreTables, type Queryable } from "./repository";

const CHANGE_LOG_ENTITY_NAME = "vacancy";

/**
 * La constraint chk_vacancy_change_log_action solo acepta acciones SQL en
 * mayúsculas. Las acciones de negocio se normalizan antes de auditar.
 */
type VacancyChangeLogAction = "INSERT" | "UPDATE" | "DELETE";

function normalizeVacancyChangeLogAction(action: string): VacancyChangeLogAction {
  switch (action) {
    case "create":
    case "insert":
    case "INSERT":
      return "INSERT";

    case "patch":
    case "update":
    case "UPDATE":
    case "close":
    case "status_change":
    case "requisition_created":
      return "UPDATE";

    case "delete":
    case "DELETE":
      return "DELETE";

    default:
      throw new Error(`Unsupported vacancy_change_log action: ${action}`);
  }
}

/**
 * Formas históricas de vacancies.vacancy_change_log.
 *
 * Algunas bases locales/dev tienen `entity_name` en vez de `entity_type`, o
 * carecen de `created_by_person_id`. Se intenta la forma actual primero y se
 * cae hacia las antiguas ante "columna inexistente" o "not null".
 */
function changeLogInsertAttempts(
  vacancyId: string,
  action: VacancyChangeLogAction,
  payload: string,
  createdBy: number | null
): Array<{ sql: string; values: unknown[] }> {
  const entity = CHANGE_LOG_ENTITY_NAME;
  const insert = (columns: string, placeholders: string, values: unknown[]) => ({
    sql: `INSERT INTO vacancies.vacancy_change_log
              (${columns})
            VALUES
              (${placeholders})`,
    values,
  });
  return [
    insert(
      "entity_type, entity_id, action, details, created_by_person_id",
      "$1, $2, $3, $4::jsonb, $5",
      [entity, vacancyId, action, payload, createdBy]
    ),
    insert("entity_type, entity_id, action, details", "$1, $2, $3, $4::jsonb", [
      entity,
      vacancyId,
      action,
      payload,
    ]),
    insert(
      "entity_name, entity_id, action, details, created_by_person_id",
      "$1, $2, $3, $4::jsonb, $5",
      [entity, vacancyId, action, payload, createdBy]
    ),
    insert("entity_name, entity_id, action, details", "$1, $2, $3, $4::jsonb", [
      entity,
      vacancyId,
      action,
      payload,
    ]),
    insert(
      "entity_type, entity_id, vacancy_id, action, details, created_by_person_id",
      "$1, $2, $2, $3, $4::jsonb, $5",
      [entity, vacancyId, action, payload, createdBy]
    ),
    insert(
      "entity_type, entity_id, vacancy_id, action, details",
      "$1, $2, $2, $3, $4::jsonb",
      [entity, vacancyId, action, payload]
    ),
    insert(
      "entity_name, entity_id, vacancy_id, action, details",
      "$1, $2, $2, $3, $4::jsonb",
      [entity, vacancyId, action, payload]
    ),
    insert(
      "vacancy_id, action, details, entity_name, created_by_person_id",
      "$1, $2, $3::jsonb, $4, $5",
      [vacancyId, action, payload, entity, createdBy]
    ),
    insert("vacancy_id, action, details, entity_name", "$1, $2, $3::jsonb, $4", [
      vacancyId,
      action,
      payload,
      entity,
    ]),
    insert("vacancy_id, action, details", "$1, $2, $3::jsonb", [
      vacancyId,
      action,
      payload,
    ]),
  ];
}

export type VacancyChangeLogOpts = {
  createdByPersonId?: number | null;
  snapshot?: Record<string, unknown>;
};

export async function insertVacancyChangeLog(
  db: Queryable,
  vacancyId: string,
  action: string,
  details: unknown,
  opts?: VacancyChangeLogOpts
): Promise<void> {
  const entityId = String(vacancyId ?? "").trim();
  if (entityId === "") {
    throw new Error("insertVacancyChangeLog: vacancyId/entityId is required");
  }

  const baseDetails =
    details != null && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : { payload: details };
  const payload = JSON.stringify({ ...baseDetails, ...(opts?.snapshot ?? {}) });
  const normalizedAction = normalizeVacancyChangeLogAction(action);

  let lastError: unknown = null;
  for (const attempt of changeLogInsertAttempts(
    vacancyId,
    normalizedAction,
    payload,
    opts?.createdByPersonId ?? null
  )) {
    try {
      await db.query(attempt.sql, attempt.values);
      return;
    } catch (e) {
      lastError = e;
      const code = (e as { code?: string }).code;

      // 42703: columna inexistente. 23502: not-null de formas antiguas sin entity_id.
      if (code === "42703" || code === "23502") continue;

      throw e;
    }
  }

  console.warn(
    "vacancy_change_log: incompatible table shape. Audit row not saved.",
    lastError
  );
}

/** Datos de la vacante que se congelan en la fila de auditoría. */
export async function loadVacancyAuditSnapshot(
  vacancyId: string
): Promise<Record<string, unknown>> {
  const mode = await resolveCoreSchemaMode();

  const sql =
    mode == null
      ? `SELECT v.public_id, v.position_name, v.operation_status, r.req_number
         FROM vacancies.vacancy v
         LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
         WHERE v.id = $1`
      : (() => {
          const t = coreTables(mode);
          return `SELECT v.public_id, v.position_name, v.operation_status,
                    a.name AS area_name, s.name AS school_name, r.req_number
             FROM vacancies.vacancy v
             JOIN ${t.area} a ON a.id = v.area_id
             LEFT JOIN ${t.school} s ON s.id = v.school_id
             LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
             WHERE v.id = $1`;
        })();

  const { rows } = await pool.query(sql, [vacancyId]);
  if (rows.length === 0) return { vacancyId };
  const row = rows[0] as Record<string, unknown>;

  const base = {
    vacancyId,
    vacancyPublicId: row.public_id == null ? null : Number(row.public_id),
    positionName: String(row.position_name ?? ""),
    operationStatus: String(row.operation_status ?? ""),
    reqNumber: row.req_number == null ? null : String(row.req_number),
  };
  if (mode == null) return base;
  return {
    ...base,
    areaName: String(row.area_name ?? ""),
    schoolName: row.school_name == null ? null : String(row.school_name),
  };
}
