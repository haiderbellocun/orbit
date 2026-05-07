import { Router } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
  type CoreSchemaMode,
} from "../lib/coreSchema";

const router = Router();

const OPERATION_STATUSES = new Set([
  "open",
  "selected",
  "requisition_sent",
  "hired",
  "closed",
  "cancelled",
]);

const CLOSE_STATUSES = new Set(["hired", "closed", "cancelled"]);

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

function mapVacancyRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    areaId: Number(row.area_id),
    schoolId: Number(row.school_id),
    programId:
      row.program_id == null ? null : Number(row.program_id),
    positionName: String(row.position_name ?? ""),
    curricularLine:
      row.curricular_line == null ? null : String(row.curricular_line),
    quantity: Number(row.quantity ?? 0),
    operationNotes:
      row.operation_notes == null ? null : String(row.operation_notes),
    capitalNotes:
      row.capital_notes == null ? null : String(row.capital_notes),
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

function mapListRow(row: Record<string, unknown>) {
  const base = mapVacancyRow(row);
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
  };
}

/** GET /vacancies */
router.get("/vacancies", async (_req, res) => {
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
         v.operation_notes,
         v.capital_notes,
         v.shortlist_complied,
         v.pda_complied,
         v.contract_conditions_complied,
         v.pre_interview_cv_complied,
         v.created_at,
         v.updated_at,
         v.closed_at,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       JOIN ${schoolT} s ON s.id = v.school_id
       LEFT JOIN ${programT} p ON p.id = v.program_id
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       ORDER BY v.created_at DESC`
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
    let areaId = numOrUndef(b.areaId);
    let schoolId = numOrUndef(b.schoolId);
    const programIdRaw = numOrUndef(b.programId);

    const positionName =
      typeof b.positionName === "string" ? b.positionName.trim() : "";
    const curricularLine =
      typeof b.curricularLine === "string" && b.curricularLine.trim() !== ""
        ? b.curricularLine.trim()
        : null;

    const quantity = numOrUndef(b.quantity);
    const operationNotes =
      typeof b.operationNotes === "string" && b.operationNotes.trim() !== ""
        ? b.operationNotes.trim()
        : null;
    const capitalNotes =
      typeof b.capitalNotes === "string" && b.capitalNotes.trim() !== ""
        ? b.capitalNotes.trim()
        : null;

    const shortlistComplied = parseOptionalBool(b.shortlistComplied);
    const pdaComplied = parseOptionalBool(b.pdaComplied);
    const contractConditionsComplied = parseOptionalBool(
      b.contractConditionsComplied
    );
    const preInterviewCvComplied = parseOptionalBool(b.preInterviewCvComplied);

    if (areaId == null || Number.isNaN(areaId)) {
      res.status(400).json({ error: "areaId is required" });
      return;
    }
    if (schoolId == null || Number.isNaN(schoolId)) {
      res.status(400).json({ error: "schoolId is required" });
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
      programId = programIdRaw;
      schoolId = ctx.schoolId;
      if (ctx.areaId != null) {
        areaId = ctx.areaId;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO vacancies.vacancy (
        area_id, school_id, program_id,
        position_name, curricular_line, quantity,
        operation_notes, capital_notes,
        shortlist_complied, pda_complied,
        contract_conditions_complied, pre_interview_cv_complied,
        operation_status
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8,
        $9, $10,
        $11, $12,
        'open'
      ) RETURNING *`,
      [
        areaId,
        schoolId,
        programId,
        positionName,
        curricularLine,
        quantity,
        operationNotes,
        capitalNotes,
        shortlistComplied,
        pdaComplied,
        contractConditionsComplied,
        preInterviewCvComplied,
      ]
    );

    const row = rows[0] as Record<string, unknown>;
    res.status(201).json(mapVacancyRow(row));
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

    const b = (req.body ?? {}) as Record<string, unknown>;
    const statusIn =
      typeof b.operationStatus === "string"
        ? b.operationStatus.trim()
        : "closed";

    if (!CLOSE_STATUSES.has(statusIn)) {
      res.status(400).json({
        error:
          "operationStatus must be one of: hired, closed, cancelled",
      });
      return;
    }

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

    res.json(mapVacancyRow(rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error("PATCH /vacancies/:id/close failed:", e);
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

  const b = req.body as Record<string, unknown>;
  const reqNumber =
    typeof b.reqNumber === "string" ? b.reqNumber.trim() : "";
  if (reqNumber === "") {
    res.status(400).json({ error: "reqNumber is required" });
    return;
  }

  let sentToCapitalAt: Date | null = null;
  if (b.sentToCapitalAt != null && String(b.sentToCapitalAt).trim() !== "") {
    const d = new Date(String(b.sentToCapitalAt));
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid sentToCapitalAt" });
      return;
    }
    sentToCapitalAt = d;
  }

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
        error: "This vacancy already has a requisition",
      });
      return;
    }

    const vac = await client.query(
      `SELECT id FROM vacancies.vacancy WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (vac.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    try {
      await client.query(
        `INSERT INTO vacancies.requisition (vacancy_id, req_number, sent_to_capital_at)
         VALUES ($1, $2, $3)`,
        [id, reqNumber, sentToCapitalAt]
      );
    } catch (insErr) {
      await client.query("ROLLBACK");
      const err = insErr as { code?: string; message?: string };
      if (err.code === "23505") {
        res.status(409).json({
          error:
            "reqNumber is already in use. Each requisition number must be unique.",
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

    const { rows } = await pool.query(
      `SELECT
         v.*,
         a.name AS area_name,
         s.name AS school_name,
         p.name AS program_name,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       JOIN ${schoolT} s ON s.id = v.school_id
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

    const { rows } = await pool.query(
      `SELECT
         v.*,
         a.name AS area_name,
         s.name AS school_name,
         p.name AS program_name,
         r.id AS requisition_id,
         r.req_number,
         r.assigned_at AS req_assigned_at,
         r.sent_to_capital_at
       FROM vacancies.vacancy v
       JOIN ${areaT} a ON a.id = v.area_id
       JOIN ${schoolT} s ON s.id = v.school_id
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
      raw.req_number == null
        ? null
        : {
            id: String(raw.requisition_id),
            reqNumber: String(raw.req_number),
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

/** PATCH /vacancies/:id */
router.patch("/vacancies/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ error: "Invalid id" });
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
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    const setCol = (col: string, val: unknown) => {
      updates.push(`${col} = $${p}`);
      values.push(val);
      p++;
    };

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
        const n = numOrUndef(b.schoolId);
        if (n == null || Number.isNaN(n)) {
          res.status(400).json({ error: "Invalid schoolId" });
          return;
        }
        setCol("school_id", n);
      }
    }

    if (b.positionName !== undefined) {
      const s = typeof b.positionName === "string" ? b.positionName.trim() : "";
      if (s === "") {
        res.status(400).json({ error: "positionName cannot be empty" });
        return;
      }
      setCol("position_name", s);
    }
    if (b.curricularLine !== undefined) {
      setCol(
        "curricular_line",
        b.curricularLine === null || b.curricularLine === ""
          ? null
          : String(b.curricularLine).trim()
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
    if (b.operationNotes !== undefined) {
      setCol(
        "operation_notes",
        b.operationNotes === null || b.operationNotes === ""
          ? null
          : String(b.operationNotes).trim()
      );
    }
    if (b.capitalNotes !== undefined) {
      setCol(
        "capital_notes",
        b.capitalNotes === null || b.capitalNotes === ""
          ? null
          : String(b.capitalNotes).trim()
      );
    }
    if (b.shortlistComplied !== undefined) {
      setCol("shortlist_complied", parseOptionalBool(b.shortlistComplied));
    }
    if (b.pdaComplied !== undefined) {
      setCol("pda_complied", parseOptionalBool(b.pdaComplied));
    }
    if (b.contractConditionsComplied !== undefined) {
      setCol(
        "contract_conditions_complied",
        parseOptionalBool(b.contractConditionsComplied)
      );
    }
    if (b.preInterviewCvComplied !== undefined) {
      setCol(
        "pre_interview_cv_complied",
        parseOptionalBool(b.preInterviewCvComplied)
      );
    }
    if (b.operationStatus !== undefined) {
      const s = String(b.operationStatus).trim();
      if (!OPERATION_STATUSES.has(s)) {
        res.status(400).json({ error: "Invalid operationStatus" });
        return;
      }
      setCol("operation_status", s);
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
    res.json(mapVacancyRow(row));
  } catch (e) {
    console.error("PATCH /vacancies/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
