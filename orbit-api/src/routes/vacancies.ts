import { Router } from "express";
import { pool } from "../db/connection";
import {
  orbitPersonIdFromRequest,
  schoolScopeFromRequest,
  vacancyAllowedForSchoolScope,
} from "../middleware/orbitAuth";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
  type CoreSchemaMode,
} from "../lib/coreSchema";
import { validateDocument } from "../lib/dataValidators";
import { toUpperAscii, toUpperAsciiOrNull } from "../lib/textNormalize";
import { notifyVacancyCreated } from "../services/vacancyNotifyService";

const router = Router();

const OPERATION_STATUSES = new Set([
  "open",
  "selected",
  "requisition_sent",
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

const CLOSE_STATUSES = new Set([
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);
const FULLY_LOCKED_STATUSES = new Set([
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

const VACANCY_FULLY_LOCKED_MESSAGE =
  "Esta vacante está contratada, cerrada, cancelada o cancelada por capital y no puede modificarse.";

type VacancyEditGate = "missing" | "blocked" | null;

async function vacancyEditGate(id: string): Promise<VacancyEditGate> {
  const r = await pool.query(
    `SELECT operation_status FROM vacancies.vacancy WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return "missing";
  const op = String(
    (r.rows[0] as { operation_status?: unknown }).operation_status ?? ""
  );
  if (FULLY_LOCKED_STATUSES.has(op)) return "blocked";
  return null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function parseOptionalBool(v: unknown): boolean | null {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  return null;
}

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const CHANGE_LOG_ENTITY_NAME = "vacancy";

/** Cumplimientos almacenados en vacancies.requisition (LEFT JOIN en listados). */
const SQL_REQUISITION_COMPLIANCE = `
         r.shortlist_complied,
         r.pda_complied,
         r.contract_conditions_complied,
         r.pre_interview_cv_complied`;

function mapComplianceFields(row: Record<string, unknown>) {
  return {
    shortlistComplied:
      row.shortlist_complied === null || row.shortlist_complied === undefined
        ? null
        : Boolean(row.shortlist_complied),
    pdaComplied:
      row.pda_complied === null || row.pda_complied === undefined
        ? null
        : Boolean(row.pda_complied),
    contractConditionsComplied:
      row.contract_conditions_complied === null ||
      row.contract_conditions_complied === undefined
        ? null
        : Boolean(row.contract_conditions_complied),
    preInterviewCvComplied:
      row.pre_interview_cv_complied === null ||
      row.pre_interview_cv_complied === undefined
        ? null
        : Boolean(row.pre_interview_cv_complied),
  };
}

/**
 * DB constraint chk_vacancy_change_log_action only accepts uppercase SQL-style actions:
 * INSERT, UPDATE, DELETE.
 *
 * Route/business actions are normalized before writing the audit log.
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

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

/**
 * Writes the audit row for vacancy changes.
 *
 * Current vacancies.vacancy_change_log requires:
 * - entity_id NOT NULL
 * - action CHECK IN ('INSERT', 'UPDATE', 'DELETE')
 *
 * Some local/dev DBs may have either entity_name or entity_type.
 * Attempts are ordered from the current shape to older fallback shapes.
 */
async function insertVacancyChangeLog(
  db: Queryable,
  vacancyId: string,
  action: string,
  details: unknown
): Promise<void> {
  if (!isUuid(vacancyId)) {
    throw new Error("insertVacancyChangeLog: vacancyId/entityId is required");
  }

  const payload = JSON.stringify(details ?? {});
  const normalizedAction = normalizeVacancyChangeLogAction(action);

  const attempts: Array<{ sql: string; values: unknown[] }> = [
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (entity_type, entity_id, action, details)
            VALUES
              ($1, $2, $3, $4::jsonb)`,
      values: [CHANGE_LOG_ENTITY_NAME, vacancyId, normalizedAction, payload],
    },
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (entity_name, entity_id, action, details)
            VALUES
              ($1, $2, $3, $4::jsonb)`,
      values: [CHANGE_LOG_ENTITY_NAME, vacancyId, normalizedAction, payload],
    },
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (entity_type, entity_id, vacancy_id, action, details)
            VALUES
              ($1, $2, $2, $3, $4::jsonb)`,
      values: [CHANGE_LOG_ENTITY_NAME, vacancyId, normalizedAction, payload],
    },
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (entity_name, entity_id, vacancy_id, action, details)
            VALUES
              ($1, $2, $2, $3, $4::jsonb)`,
      values: [CHANGE_LOG_ENTITY_NAME, vacancyId, normalizedAction, payload],
    },
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (vacancy_id, action, details, entity_name)
            VALUES
              ($1, $2, $3::jsonb, $4)`,
      values: [vacancyId, normalizedAction, payload, CHANGE_LOG_ENTITY_NAME],
    },
    {
      sql: `INSERT INTO vacancies.vacancy_change_log
              (vacancy_id, action, details)
            VALUES
              ($1, $2, $3::jsonb)`,
      values: [vacancyId, normalizedAction, payload],
    },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      await db.query(attempt.sql, attempt.values);
      return;
    } catch (e) {
      lastError = e;
      const code = (e as { code?: string }).code;

      // 42703: undefined column.
      // 23502: not-null violation from old insert shapes missing entity_id.
      if (code === "42703" || code === "23502") {
        continue;
      }

      throw e;
    }
  }

  console.warn(
    "vacancy_change_log: incompatible table shape. Audit row not saved.",
    lastError
  );
}

async function loadSchoolArea(
  mode: CoreSchemaMode,
  schoolId: number
): Promise<{ areaId: number | null } | null> {
  const schoolT = qualifiedCoreTable(mode, "school");
  const { rows } = await pool.query(
    `SELECT area_id
     FROM ${schoolT}
     WHERE id = $1 AND COALESCE(is_active, true) = true`,
    [schoolId]
  );
  if (rows.length === 0) return null;
  const r = rows[0] as { area_id: number | null };
  return { areaId: r.area_id };
}

async function denyIfVacancyOutOfSchoolScope(
  req: import("express").Request,
  res: import("express").Response,
  vacancyId: string
): Promise<boolean> {
  if (schoolScopeFromRequest(req) == null) return false;
  const r = await pool.query(
    `SELECT school_id FROM vacancies.vacancy WHERE id = $1`,
    [vacancyId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return true;
  }
  const sid = (r.rows[0] as { school_id: number | null }).school_id;
  if (!vacancyAllowedForSchoolScope(req, sid)) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return true;
  }
  return false;
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
  const r = rows[0] as { school_id: number; area_id: number | null };
  return { schoolId: r.school_id, areaId: r.area_id };
}

type VacancyOperationNoteDto = {
  id: string;
  text: string;
  createdAt: string;
  createdByPersonId: number | null;
  createdByName: string | null;
};

function sqlOperationNotesAgg(personTable: string): string {
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

function mapNotesFromJsonRaw(raw: unknown): VacancyOperationNoteDto[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: VacancyOperationNoteDto[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = o.id != null ? String(o.id) : "";
    const text = o.text != null ? String(o.text) : "";
    if (id === "" || text === "") continue;
    const createdAtRaw = o.createdAt ?? o.created_at;
    const createdAt =
      createdAtRaw != null
        ? new Date(String(createdAtRaw)).toISOString()
        : "";
    const cbp = o.createdByPersonId ?? o.created_by_person_id;
    const createdByPersonId =
      cbp == null || cbp === "" ? null : Number(cbp);
    const cname = o.createdByName ?? o.created_by_name;
    const createdByName =
      cname == null || String(cname).trim() === ""
        ? null
        : String(cname);
    out.push({
      id,
      text,
      createdAt,
      createdByPersonId:
        createdByPersonId != null && Number.isFinite(createdByPersonId)
          ? createdByPersonId
          : null,
      createdByName,
    });
  }
  return out;
}

async function loadOperationNotesForVacancy(
  vacancyId: string,
  mode: CoreSchemaMode
): Promise<VacancyOperationNoteDto[]> {
  const personT = qualifiedCoreTable(mode, "person");
  try {
    const { rows } = await pool.query(
      `SELECT
         n.id,
         n.body,
         n.created_at,
         n.created_by_person_id,
         per.full_name AS created_by_name
       FROM vacancies.vacancy_operation_note n
       LEFT JOIN ${personT} per ON per.id = n.created_by_person_id
       WHERE n.vacancy_id = $1
       ORDER BY n.created_at ASC`,
      [vacancyId]
    );
    return rows.map((r) => ({
      id: String((r as { id: unknown }).id),
      text: String((r as { body: unknown }).body ?? ""),
      createdAt:
        (r as { created_at?: unknown }).created_at != null
          ? new Date(
              (r as { created_at: string | Date }).created_at
            ).toISOString()
          : "",
      createdByPersonId:
        (r as { created_by_person_id?: unknown }).created_by_person_id ==
        null
          ? null
          : Number((r as { created_by_person_id: unknown }).created_by_person_id),
      createdByName:
        (r as { created_by_name?: unknown }).created_by_name == null
          ? null
          : String((r as { created_by_name: unknown }).created_by_name),
    }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01" || code === "42703") {
      console.warn(
        "vacancy_operation_note / person join: returning empty notes.",
        e
      );
      return [];
    }
    throw e;
  }
}

function mapVacancyRow(
  row: Record<string, unknown>,
  operationNotes: VacancyOperationNoteDto[]
) {
  return {
    id: String(row.id),
    areaId: Number(row.area_id),
    schoolId:
      row.school_id == null ? null : Number(row.school_id),
    programId:
      row.program_id == null ? null : Number(row.program_id),
    positionName: String(row.position_name ?? ""),
    curricularLine:
      row.curricular_line == null ? null : String(row.curricular_line),
    directManagerIdentification: validateDocument(
      row.direct_manager_identification
    ),
    quantity: Number(row.quantity ?? 0),
    operationNotes,
    ...mapComplianceFields(row),
    operationStatus: String(row.operation_status ?? "open"),
    createdAt:
      row.created_at != null
        ? new Date(row.created_at as string | Date).toISOString()
        : "",
    updatedAt:
      row.updated_at != null
        ? new Date(row.updated_at as string | Date).toISOString()
        : undefined,
    closedAt:
      row.closed_at == null
        ? null
        : new Date(row.closed_at as string | Date).toISOString(),
  };
}

async function notifyVacancyCreatedFromId(vacancyId: string): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return;

  const areaT = qualifiedCoreTable(mode, "area");
  const schoolT = qualifiedCoreTable(mode, "school");
  const programT = qualifiedCoreTable(mode, "program");
  const personT = qualifiedCoreTable(mode, "person");
  const opNotesSql = sqlOperationNotesAgg(personT);

  const { rows } = await pool.query(
    `SELECT
       v.id,
       v.position_name,
       v.quantity,
       v.created_at,
       a.name AS area_name,
       s.name AS school_name,
       p.name AS program_name,
       ${opNotesSql} AS operation_notes_json
     FROM vacancies.vacancy v
     JOIN ${areaT} a ON a.id = v.area_id
     LEFT JOIN ${schoolT} s ON s.id = v.school_id
     LEFT JOIN ${programT} p ON p.id = v.program_id
     WHERE v.id = $1`,
    [vacancyId]
  );
  if (rows.length === 0) return;
  const raw = rows[0] as Record<string, unknown>;
  const createdAt =
    raw.created_at != null
      ? new Date(raw.created_at as string | Date).toISOString()
      : new Date().toISOString();
  await notifyVacancyCreated({
    vacancyId,
    positionName: String(raw.position_name ?? ""),
    areaName: String(raw.area_name ?? ""),
    schoolName:
      raw.school_name == null ? null : String(raw.school_name),
    programName:
      raw.program_name == null ? null : String(raw.program_name),
    quantity: Number(raw.quantity ?? 1),
    createdAt,
  });
}

function mapListRow(row: Record<string, unknown>) {
  const notes = mapNotesFromJsonRaw(row.operation_notes_json);
  const base = mapVacancyRow(row, notes);
  const cap = row.requisition_capital_notes;
  return {
    ...base,
    areaName: String(row.area_name ?? ""),
    schoolName: String(row.school_name ?? ""),
    programName:
      row.program_id == null ? null : String(row.program_name ?? ""),
    reqNumber: row.req_number == null ? null : String(row.req_number),
    reqAssignedAt:
      row.req_assigned_at == null
        ? null
        : new Date(row.req_assigned_at as string | Date).toISOString(),
    sentToCapitalAt:
      row.sent_to_capital_at == null
        ? null
        : new Date(row.sent_to_capital_at as string | Date).toISOString(),
    capitalNotes:
      cap == null || String(cap).trim() === "" ? null : String(cap),
  };
}

/** GET /vacancies */
router.get("/vacancies", async (req, res) => {
  try {
    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({
        error: "CORE catalog (area/school/program) is not available",
      });
      return;
    }
    const areaT = qualifiedCoreTable(mode, "area");
    const schoolT = qualifiedCoreTable(mode, "school");
    const programT = qualifiedCoreTable(mode, "program");
    const personT = qualifiedCoreTable(mode, "person");
    const opNotesSql = sqlOperationNotesAgg(personT);
    const schoolScope = schoolScopeFromRequest(req);
    const schoolFilter = schoolScope ? `WHERE v.school_id = $1` : "";
    const queryParams = schoolScope ? [schoolScope.schoolId] : [];

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.area_id,
         a.name AS area_name,
         v.school_id,
         s.name AS school_name,
         v.program_id,
         p.name AS program_name,
         v.position_name,
         v.curricular_line,
         v.quantity,
         v.operation_status,
         ${opNotesSql} AS operation_notes_json,
         ${SQL_REQUISITION_COMPLIANCE},
         v.created_at,
         v.updated_at,
         v.closed_at,
         v.direct_manager_identification,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at,
         r.capital_notes AS requisition_capital_notes
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       LEFT JOIN ${schoolT} s ON s.id = v.school_id
       LEFT JOIN ${programT} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       ${schoolFilter}
       ORDER BY v.created_at DESC`,
      queryParams
    );

    res.json({ data: rows.map((r) => mapListRow(r as Record<string, unknown>)) });
  } catch (e) {
    console.error("GET /vacancies failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /vacancies */
router.post("/vacancies", async (req, res) => {
  try {
    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({
        error: "CORE catalog (area/school/program) is not available",
      });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const schoolScope = schoolScopeFromRequest(req);
    let areaId = numOrUndef(b.areaId);
    let schoolId: number | null = null;
    if (schoolScope != null) {
      schoolId = schoolScope.schoolId;
    } else if (
      b.schoolId !== undefined &&
      b.schoolId !== null &&
      String(b.schoolId).trim() !== ""
    ) {
      const sid = numOrUndef(b.schoolId);
      if (sid == null || Number.isNaN(sid)) {
        res.status(400).json({ error: "Invalid schoolId" });
        return;
      }
      schoolId = sid;
    }
    const programIdRaw = numOrUndef(b.programId);

    const positionName =
      typeof b.positionName === "string" ? toUpperAscii(b.positionName) : "";
    const curricularLine =
      typeof b.curricularLine === "string" && b.curricularLine.trim() !== ""
        ? toUpperAscii(b.curricularLine)
        : null;

    const quantity = numOrUndef(b.quantity);
    const initialOperationNote =
      typeof b.operationNotes === "string" && b.operationNotes.trim() !== ""
        ? toUpperAscii(b.operationNotes)
        : null;

    if (schoolScope != null) {
      const schoolCtx = await loadSchoolArea(mode, schoolScope.schoolId);
      if (schoolCtx == null) {
        res.status(400).json({ error: "School not found or inactive" });
        return;
      }
      schoolId = schoolScope.schoolId;
      if (schoolCtx.areaId != null) {
        areaId = schoolCtx.areaId;
      }
    }

    if (areaId == null || Number.isNaN(areaId)) {
      res.status(400).json({ error: "areaId is required" });
      return;
    }
    if (positionName === "") {
      res.status(400).json({ error: "positionName is required" });
      return;
    }
    if (quantity == null || Number.isNaN(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity must be a positive number" });
      return;
    }

    let programId: number | null = null;
    if (programIdRaw != null) {
      if (Number.isNaN(programIdRaw)) {
        res.status(400).json({ error: "Invalid programId" });
        return;
      }
      const ctx = await loadProgramSchoolArea(mode, programIdRaw);
      if (ctx == null) {
        res.status(400).json({ error: "programId not found or inactive" });
        return;
      }
      if (schoolScope != null && ctx.schoolId !== schoolScope.schoolId) {
        res.status(400).json({
          error: "El programa no pertenece a tu escuela",
        });
        return;
      }
      programId = programIdRaw;
      schoolId = ctx.schoolId;
      if (ctx.areaId != null) {
        areaId = ctx.areaId;
      }
    }

    if (
      schoolScope != null &&
      (schoolId == null || schoolId !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    const directManagerIdentification =
      b.directManagerIdentification !== undefined
        ? validateDocument(b.directManagerIdentification)
        : null;

    const { rows } = await pool.query(
      `INSERT INTO vacancies.vacancy (
        area_id, school_id, program_id,
        position_name, curricular_line, quantity,
        direct_manager_identification,
        operation_status
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7,
        'open'
      ) RETURNING *`,
      [
        areaId,
        schoolId,
        programId,
        positionName,
        curricularLine,
        quantity,
        directManagerIdentification,
      ]
    );

    const row = rows[0] as Record<string, unknown>;
    const vacancyId = String(row.id);
    const personId = orbitPersonIdFromRequest(req);

    if (initialOperationNote != null) {
      await pool.query(
        `INSERT INTO vacancies.vacancy_operation_note
          (vacancy_id, body, created_by_person_id)
         VALUES ($1, $2, $3)`,
        [vacancyId, initialOperationNote, personId]
      );
    }

    const operationNotes = await loadOperationNotesForVacancy(
      vacancyId,
      mode
    );
    res.status(201).json(mapVacancyRow(row, operationNotes));
    void notifyVacancyCreatedFromId(vacancyId).catch((err) => {
      console.error("POST /vacancies notify failed:", err);
    });
  } catch (e) {
    console.error("POST /vacancies failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /vacancies/:id/close */
router.patch("/vacancies/:id/close", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const b = (req.body ?? {}) as Record<string, unknown>;
    const statusIn =
      typeof b.operationStatus === "string"
        ? b.operationStatus.trim()
        : "closed";

    if (!CLOSE_STATUSES.has(statusIn)) {
      res.status(400).json({
        error:
          "Estado final no válido: operationStatus debe ser hired, closed, cancelled o cancelled_by_capital.",
      });
      return;
    }

    const gate = await vacancyEditGate(id);
    if (gate === "missing") {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }
    if (gate === "blocked") {
      res.status(409).json({ error: VACANCY_FULLY_LOCKED_MESSAGE });
      return;
    }

    const mode = await resolveCoreSchemaMode();

    const { rows } = await pool.query(
      `UPDATE vacancies.vacancy
       SET operation_status = $1,
           closed_at = now()
       WHERE id = $2
       RETURNING *`,
      [statusIn, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    await insertVacancyChangeLog(pool, id, "UPDATE", {
      operationStatus: statusIn,
    });

    const row = rows[0] as Record<string, unknown>;
    const notes =
      mode != null
        ? await loadOperationNotesForVacancy(id, mode)
        : [];
    res.json(mapVacancyRow(row, notes));
  } catch (e) {
    console.error("PATCH /vacancies/:id/close failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /vacancies/:id/operation-notes */
router.post("/vacancies/:id/operation-notes", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const gate = await vacancyEditGate(id);
    if (gate === "missing") {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }
    if (gate === "blocked") {
      res.status(409).json({ error: VACANCY_FULLY_LOCKED_MESSAGE });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({
        error: "CORE catalog (area/school/program) is not available",
      });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const text = toUpperAscii(
      typeof b.text === "string"
        ? b.text
        : typeof b.operationNotes === "string"
          ? b.operationNotes
          : ""
    );
    if (text === "") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const personId = orbitPersonIdFromRequest(req);

    const ins = await pool.query(
      `INSERT INTO vacancies.vacancy_operation_note
        (vacancy_id, body, created_by_person_id)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at, created_by_person_id`,
      [id, text, personId]
    );
    const r0 = ins.rows[0] as {
      id: unknown;
      body: unknown;
      created_at: unknown;
      created_by_person_id: unknown;
    };
    const personT = qualifiedCoreTable(mode, "person");
    let createdByName: string | null = null;
    if (personId != null) {
      const pn = await pool.query(
        `SELECT full_name FROM ${personT} WHERE id = $1`,
        [personId]
      );
      if (pn.rows.length > 0) {
        createdByName = String(
          (pn.rows[0] as { full_name?: unknown }).full_name ?? ""
        );
        if (createdByName.trim() === "") createdByName = null;
      }
    }

    const note: VacancyOperationNoteDto = {
      id: String(r0.id),
      text: String(r0.body ?? ""),
      createdAt:
        r0.created_at != null
          ? new Date(r0.created_at as string | Date).toISOString()
          : "",
      createdByPersonId: personId,
      createdByName,
    };

    await insertVacancyChangeLog(pool, id, "UPDATE", {
      operationNoteAppended: true,
    });

    res.status(201).json({ note });
  } catch (e) {
    console.error("POST /vacancies/:id/operation-notes failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /vacancies/:id/requisition */
router.post("/vacancies/:id/requisition", async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

  const b = req.body as Record<string, unknown>;
  const reqNumberRaw =
    typeof b.reqNumber === "string" ? toUpperAscii(b.reqNumber) : "";
  const reqNumber = reqNumberRaw === "" ? null : reqNumberRaw;

  let sentToCapitalAt: Date | null = null;
  if (b.sentToCapitalAt != null && String(b.sentToCapitalAt).trim() !== "") {
    const d = new Date(String(b.sentToCapitalAt));
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid sentToCapitalAt" });
      return;
    }
    sentToCapitalAt = d;
  }

  const capitalNotes =
    typeof b.capitalNotes === "string" && b.capitalNotes.trim() !== ""
      ? toUpperAscii(b.capitalNotes)
      : null;

  const shortlistComplied = parseOptionalBool(b.shortlistComplied);
  const pdaComplied = parseOptionalBool(b.pdaComplied);
  const contractConditionsComplied = parseOptionalBool(
    b.contractConditionsComplied
  );
  const preInterviewCvComplied = parseOptionalBool(b.preInterviewCvComplied);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT 1 FROM vacancies.requisition WHERE vacancy_id = $1`,
      [id]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "Esta vacante ya tiene una requisición registrada.",
      });
      return;
    }

    const vac = await client.query(
      `SELECT id, operation_status FROM vacancies.vacancy WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (vac.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }
    const vacOp = String(
      (vac.rows[0] as { operation_status?: unknown }).operation_status ?? ""
    );
    if (FULLY_LOCKED_STATUSES.has(vacOp)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: VACANCY_FULLY_LOCKED_MESSAGE });
      return;
    }

    try {
      await client.query(
        `INSERT INTO vacancies.requisition (
           vacancy_id, req_number, sent_to_capital_at, capital_notes,
           shortlist_complied, pda_complied,
           contract_conditions_complied, pre_interview_cv_complied
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          reqNumber,
          sentToCapitalAt,
          capitalNotes,
          shortlistComplied,
          pdaComplied,
          contractConditionsComplied,
          preInterviewCvComplied,
        ]
      );
    } catch (insErr) {
      await client.query("ROLLBACK");
      const err = insErr as { code?: string; message?: string };
      if (err.code === "23505") {
        res.status(409).json({
          error:
            "El número REQ ya está en uso; cada requisición debe tener un número único.",
        });
        return;
      }
      throw insErr;
    }

    await client.query(
      `UPDATE vacancies.vacancy
       SET operation_status = 'requisition_sent'
       WHERE id = $1`,
      [id]
    );

    await insertVacancyChangeLog(client, id, "UPDATE", {
      reqNumber,
      sentToCapitalAt,
      capitalNotes,
      shortlistComplied,
      pdaComplied,
      contractConditionsComplied,
      preInterviewCvComplied,
    });

    await client.query("COMMIT");

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({ ok: true });
      return;
    }
    const areaT = qualifiedCoreTable(mode, "area");
    const schoolT = qualifiedCoreTable(mode, "school");
    const programT = qualifiedCoreTable(mode, "program");
    const personT = qualifiedCoreTable(mode, "person");
    const opNotesSql = sqlOperationNotesAgg(personT);

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.area_id,
         a.name AS area_name,
         v.school_id,
         s.name AS school_name,
         v.program_id,
         p.name AS program_name,
         v.position_name,
         v.curricular_line,
         v.quantity,
         v.operation_status,
         ${opNotesSql} AS operation_notes_json,
         ${SQL_REQUISITION_COMPLIANCE},
         v.created_at,
         v.updated_at,
         v.closed_at,
         v.direct_manager_identification,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at,
         r.capital_notes AS requisition_capital_notes
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       LEFT JOIN ${schoolT} s ON s.id = v.school_id
       LEFT JOIN ${programT} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       WHERE v.id = $1`,
      [id]
    );

    res.status(201).json(mapListRow(rows[0] as Record<string, unknown>));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /vacancies/:id/requisition failed:", e);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

/** GET /vacancies/:id */
router.get("/vacancies/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({
        error: "CORE catalog (area/school/program) is not available",
      });
      return;
    }

    const areaT = qualifiedCoreTable(mode, "area");
    const schoolT = qualifiedCoreTable(mode, "school");
    const programT = qualifiedCoreTable(mode, "program");
    const personT = qualifiedCoreTable(mode, "person");
    const opNotesSql = sqlOperationNotesAgg(personT);

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.area_id,
         a.name AS area_name,
         v.school_id,
         s.name AS school_name,
         v.program_id,
         p.name AS program_name,
         v.position_name,
         v.curricular_line,
         v.quantity,
         v.operation_status,
         ${opNotesSql} AS operation_notes_json,
         ${SQL_REQUISITION_COMPLIANCE},
         v.created_at,
         v.updated_at,
         v.closed_at,
         v.direct_manager_identification,
         r.id AS requisition_id,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at,
         r.capital_notes AS requisition_capital_notes
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       LEFT JOIN ${schoolT} s ON s.id = v.school_id
       LEFT JOIN ${programT} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       WHERE v.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const raw = rows[0] as Record<string, unknown>;
    const base = mapListRow(raw);

    const requisition =
      raw.requisition_id == null
        ? null
        : {
            id: String(raw.requisition_id),
            reqNumber:
              raw.req_number == null ? null : String(raw.req_number),
            assignedAt:
              raw.req_assigned_at != null
                ? new Date(raw.req_assigned_at as string | Date).toISOString()
                : "",
            sentToCapitalAt:
              raw.sent_to_capital_at == null
                ? null
                : new Date(
                    raw.sent_to_capital_at as string | Date
                  ).toISOString(),
            capitalNotes:
              raw.requisition_capital_notes == null ||
              String(raw.requisition_capital_notes).trim() === ""
                ? null
                : String(raw.requisition_capital_notes),
            ...mapComplianceFields(raw),
          };

    let statusHistory: Array<{
      id: string;
      previousOperationStatus: string | null;
      newOperationStatus: string;
      changedAt: string;
      changedByPersonId: number | null;
    }> = [];

    try {
      const hist = await pool.query(
        `SELECT
           id,
           previous_operation_status,
           new_operation_status,
           changed_at,
           changed_by_person_id
         FROM vacancies.vacancy_status_history
         WHERE vacancy_id = $1
         ORDER BY changed_at ASC`,
        [id]
      );

      statusHistory = hist.rows.map((h) => ({
        id: String(h.id),
        previousOperationStatus:
          h.previous_operation_status == null
            ? null
            : String(h.previous_operation_status),
        newOperationStatus: String(h.new_operation_status ?? ""),
        changedAt:
          h.changed_at != null
            ? new Date(h.changed_at as string | Date).toISOString()
            : "",
        changedByPersonId:
          h.changed_by_person_id == null ? null : Number(h.changed_by_person_id),
      }));
    } catch (histErr) {
      const code = (histErr as { code?: string }).code;
      if (code === "42703") {
        console.warn(
          "vacancy_status_history: column mismatch (run npm run migrate:vacancies). Returning empty statusHistory."
        );
      } else {
        throw histErr;
      }
    }

    res.json({
      ...base,
      requisition,
      statusHistory,
    });
  } catch (e) {
    console.error("GET /vacancies/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /vacancies/:id/requisition */
router.patch("/vacancies/:id/requisition", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const gate = await vacancyEditGate(id);
    if (gate === "missing") {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }
    if (gate === "blocked") {
      res.status(409).json({ error: VACANCY_FULLY_LOCKED_MESSAGE });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (b.reqNumber !== undefined) {
      const rn =
        b.reqNumber === null || String(b.reqNumber).trim() === ""
          ? null
          : toUpperAscii(String(b.reqNumber));
      updates.push(`req_number = $${p}`);
      values.push(rn);
      p++;
    }

    if (b.capitalNotes !== undefined) {
      updates.push(`capital_notes = $${p}`);
      values.push(
        b.capitalNotes === null || String(b.capitalNotes).trim() === ""
          ? null
          : toUpperAscii(String(b.capitalNotes))
      );
      p++;
    }

    if (b.sentToCapitalAt !== undefined) {
      if (b.sentToCapitalAt === null || String(b.sentToCapitalAt).trim() === "") {
        updates.push(`sent_to_capital_at = $${p}`);
        values.push(null);
      } else {
        const d = new Date(String(b.sentToCapitalAt));
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Invalid sentToCapitalAt" });
          return;
        }
        updates.push(`sent_to_capital_at = $${p}`);
        values.push(d.toISOString());
      }
      p++;
    }

    const setReqBool = (col: string, key: string) => {
      if (b[key] !== undefined) {
        updates.push(`${col} = $${p}`);
        values.push(parseOptionalBool(b[key]));
        p++;
      }
    };
    setReqBool("shortlist_complied", "shortlistComplied");
    setReqBool("pda_complied", "pdaComplied");
    setReqBool("contract_conditions_complied", "contractConditionsComplied");
    setReqBool("pre_interview_cv_complied", "preInterviewCvComplied");

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    values.push(id);
    let result;
    try {
      result = await pool.query(
        `UPDATE vacancies.requisition
         SET ${updates.join(", ")}
         WHERE vacancy_id = $${p}
         RETURNING id`,
        values
      );
    } catch (updErr) {
      const err = updErr as { code?: string };
      if (err.code === "23505") {
        res.status(409).json({
          error:
            "El número REQ ya está en uso; cada requisición debe tener un número único.",
        });
        return;
      }
      throw updErr;
    }

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Requisition not found for this vacancy" });
      return;
    }

    await insertVacancyChangeLog(pool, id, "UPDATE", {
      requisitionPatch: b,
    });

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({ ok: true });
      return;
    }

    const areaT = qualifiedCoreTable(mode, "area");
    const schoolT = qualifiedCoreTable(mode, "school");
    const programT = qualifiedCoreTable(mode, "program");
    const personT = qualifiedCoreTable(mode, "person");
    const opNotesSql = sqlOperationNotesAgg(personT);

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.area_id,
         a.name AS area_name,
         v.school_id,
         s.name AS school_name,
         v.program_id,
         p.name AS program_name,
         v.position_name,
         v.curricular_line,
         v.quantity,
         v.operation_status,
         ${opNotesSql} AS operation_notes_json,
         ${SQL_REQUISITION_COMPLIANCE},
         v.created_at,
         v.updated_at,
         v.closed_at,
         v.direct_manager_identification,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at,
         r.capital_notes AS requisition_capital_notes
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       LEFT JOIN ${schoolT} s ON s.id = v.school_id
       LEFT JOIN ${programT} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       WHERE v.id = $1`,
      [id]
    );

    res.json(mapListRow(rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error("PATCH /vacancies/:id/requisition failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /vacancies/:id */
router.patch("/vacancies/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const gate = await vacancyEditGate(id);
    if (gate === "missing") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (gate === "blocked") {
      res.status(409).json({ error: VACANCY_FULLY_LOCKED_MESSAGE });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({
        error: "CORE catalog (area/school/program) is not available",
      });
      return;
    }

    const b = req.body as Record<string, unknown>;

    const existingCcRow = await pool.query(
      `SELECT direct_manager_identification FROM vacancies.vacancy WHERE id = $1`,
      [id]
    );
    const existingCc = validateDocument(
      (existingCcRow.rows[0] as { direct_manager_identification?: unknown })
        ?.direct_manager_identification
    );

    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    const setCol = (col: string, val: unknown) => {
      updates.push(`${col} = $${p}`);
      values.push(val);
      p++;
    };

    if (b.directManagerIdentification !== undefined) {
      const incoming = validateDocument(b.directManagerIdentification);
      if (existingCc != null) {
        if (incoming !== existingCc) {
          res.status(409).json({
            error:
              "La CC del jefe directo no puede modificarse una vez registrada.",
          });
          return;
        }
      } else if (incoming != null) {
        setCol("direct_manager_identification", incoming);
      }
    }

    // programId + schoolId/areaId in the same body must not emit duplicate SET school_id / area_id.
    // Non-null programId: CORE infers school (and area when available); ignore explicit schoolId/areaId.
    // programId null: clear program; still allow areaId / schoolId in this request.
    if (b.programId !== undefined && b.programId !== null) {
      const pid = numOrUndef(b.programId);
      if (pid == null || Number.isNaN(pid)) {
        res.status(400).json({ error: "Invalid programId" });
        return;
      }
      const ctx = await loadProgramSchoolArea(mode, pid);
      if (ctx == null) {
        res.status(400).json({ error: "programId not found or inactive" });
        return;
      }
      setCol("program_id", pid);
      setCol("school_id", ctx.schoolId);
      if (ctx.areaId != null) {
        setCol("area_id", ctx.areaId);
      }
    } else {
      if (b.programId === null) {
        setCol("program_id", null);
      }
      if (b.areaId !== undefined) {
        const n = numOrUndef(b.areaId);
        if (n == null || Number.isNaN(n)) {
          res.status(400).json({ error: "Invalid areaId" });
          return;
        }
        setCol("area_id", n);
      }
      if (b.schoolId !== undefined) {
        if (b.schoolId === null || b.schoolId === "") {
          setCol("school_id", null);
        } else {
          const n = numOrUndef(b.schoolId);
          if (n == null || Number.isNaN(n)) {
            res.status(400).json({ error: "Invalid schoolId" });
            return;
          }
          setCol("school_id", n);
        }
      }
    }

    if (b.positionName !== undefined) {
      const s =
        typeof b.positionName === "string" ? toUpperAscii(b.positionName) : "";
      if (s === "") {
        res.status(400).json({ error: "positionName cannot be empty" });
        return;
      }
      setCol("position_name", s);
    }
    if (b.curricularLine !== undefined) {
      setCol(
        "curricular_line",
        toUpperAsciiOrNull(
          b.curricularLine === null || b.curricularLine === ""
            ? null
            : String(b.curricularLine)
        )
      );
    }
    if (b.quantity !== undefined) {
      const n = numOrUndef(b.quantity);
      if (n == null || n <= 0) {
        res.status(400).json({ error: "quantity must be a positive number" });
        return;
      }
      setCol("quantity", n);
    }
    if (b.operationStatus !== undefined) {
      const s = String(b.operationStatus).trim();
      if (!OPERATION_STATUSES.has(s)) {
        res.status(400).json({ error: "Invalid operationStatus" });
        return;
      }
      setCol("operation_status", s);
      if (FULLY_LOCKED_STATUSES.has(s)) {
        updates.push(`closed_at = COALESCE(closed_at, now())`);
      }
    }
    if (b.closedAt !== undefined) {
      if (b.closedAt === null) {
        setCol("closed_at", null);
      } else {
        const d = new Date(String(b.closedAt));
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Invalid closedAt" });
          return;
        }
        setCol("closed_at", d.toISOString());
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE vacancies.vacancy SET ${updates.join(", ")} WHERE id = $${p} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await insertVacancyChangeLog(pool, id, "UPDATE", b);

    const row = result.rows[0] as Record<string, unknown>;
    const notes = await loadOperationNotesForVacancy(id, mode);
    res.json(mapVacancyRow(row, notes));
  } catch (e) {
    console.error("PATCH /vacancies/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
