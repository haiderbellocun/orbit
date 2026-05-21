import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import {
  newsScopeFromRequest,
  type NewsScope,
} from "../lib/newsScope";
import { hasCapability, ORBIT_CAPABILITY } from "../lib/orbitCapabilities";
import { orbitPersonIdFromRequest } from "../middleware/orbitAuth";

const router = Router();

const EVENT_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "TAKEN",
  "NOT_TAKEN",
  "CANCELLED",
]);

const EVENT_SCHEDULE_SQL = `
         e.start_date,
         e.end_date,
         e.start_time,
         e.end_time`;

function requireNewsAccess(req: Request, res: Response): boolean {
  const u = req.orbitUser;
  if (!u || !hasCapability(u.capabilities, ORBIT_CAPABILITY.NEWS)) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return false;
  }
  return true;
}

function requireNewsScope(
  req: Request,
  res: Response
): NewsScope | null {
  if (!requireNewsAccess(req, res)) return null;
  const scope = newsScopeFromRequest(req);
  if (scope == null) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return null;
  }
  return scope;
}

function scopeSql(
  scope: NewsScope,
  aliasAp: string,
  aliasS: string,
  startIdx: number
): { clause: string; values: unknown[]; nextIdx: number } {
  if (scope.kind === "school") {
    return {
      clause: `${aliasAp}.school_id = $${startIdx}`,
      values: [scope.schoolId],
      nextIdx: startIdx + 1,
    };
  }
  if (scope.kind === "area") {
    return {
      clause: `COALESCE(${aliasAp}.area_id, ${aliasS}.area_id) = $${startIdx}`,
      values: [scope.areaId],
      nextIdx: startIdx + 1,
    };
  }
  return { clause: "TRUE", values: [], nextIdx: startIdx };
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function pickBodyField(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (body[k] !== undefined) return body[k];
  }
  return undefined;
}

function parseDateField(v: unknown): string | null | { error: string } {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { error: "Fecha inválida (use YYYY-MM-DD)" };
  }
  return s;
}

function parseTimeField(v: unknown): string | null | { error: string } {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return { error: "Hora inválida (use HH:MM)" };
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return { error: "Hora inválida" };
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatDateOut(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatTimeOut(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function normalizeSchedulePayload(body: Record<string, unknown>): {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
} | { error: string } {
  const startDate = parseDateField(
    pickBodyField(body, "start_date", "startDate", "fecha_inicio")
  );
  if (typeof startDate === "object" && startDate && "error" in startDate) {
    return startDate;
  }
  const endDate = parseDateField(
    pickBodyField(body, "end_date", "endDate", "fecha_fin")
  );
  if (typeof endDate === "object" && endDate && "error" in endDate) {
    return endDate;
  }
  const startTime = parseTimeField(
    pickBodyField(body, "start_time", "startTime", "hora_inicio")
  );
  if (typeof startTime === "object" && startTime && "error" in startTime) {
    return startTime;
  }
  const endTime = parseTimeField(
    pickBodyField(body, "end_time", "endTime", "hora_fin")
  );
  if (typeof endTime === "object" && endTime && "error" in endTime) {
    return endTime;
  }

  if (
    startDate != null &&
    endDate != null &&
    endDate < startDate
  ) {
    return { error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }

  return {
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
  };
}

function hasScheduleFieldsInBody(body: Record<string, unknown>): boolean {
  return (
    pickBodyField(
      body,
      "start_date",
      "startDate",
      "fecha_inicio",
      "end_date",
      "endDate",
      "fecha_fin",
      "start_time",
      "startTime",
      "hora_inicio",
      "end_time",
      "endTime",
      "hora_fin"
    ) !== undefined
  );
}

function mapEventRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    event_type_id: Number(row.event_type_id),
    event_type_name: String(row.event_type_name ?? ""),
    observation:
      row.observation == null || String(row.observation).trim() === ""
        ? null
        : String(row.observation),
    status: String(row.status),
    start_date: formatDateOut(row.start_date),
    end_date: formatDateOut(row.end_date),
    start_time: formatTimeOut(row.start_time),
    end_time: formatTimeOut(row.end_time),
    created_at: new Date(row.created_at as string | Date).toISOString(),
    updated_at: new Date(row.updated_at as string | Date).toISOString(),
    person: {
      id: Number(row.person_id),
      name: String(row.person_name ?? ""),
      document:
        row.person_document == null ? null : String(row.person_document),
      school_id:
        row.person_school_id == null ? null : Number(row.person_school_id),
      school_name:
        row.person_school_name == null
          ? null
          : String(row.person_school_name),
      area_name:
        row.person_area_name == null ? null : String(row.person_area_name),
    },
    created_by_person: {
      id: Number(row.created_by_person_id),
      name: String(row.created_by_name ?? ""),
    },
  };
}

async function insertEventStatusLog(params: {
  eventId: string;
  previousStatus: string | null;
  newStatus: string;
  changedByPersonId: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO workforce_events.event_status_log (
       event_id, previous_status, new_status, changed_by_person_id
     ) VALUES ($1::uuid, $2, $3, $4)`,
    [
      params.eventId,
      params.previousStatus,
      params.newStatus,
      params.changedByPersonId,
    ]
  );
}

function mapStatusLogRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    event_id: String(row.event_id),
    previous_status:
      row.previous_status == null ? null : String(row.previous_status),
    new_status: String(row.new_status),
    changed_at: new Date(row.changed_at as string | Date).toISOString(),
    changed_by_person: {
      id: Number(row.changed_by_person_id),
      name: String(row.changed_by_name ?? ""),
    },
  };
}

async function fetchPersonInScope(
  personId: number,
  scope: NewsScope,
  mode: "core" | "public"
): Promise<{ school_id: number | null; area_id: number | null } | null> {
  const personT = qualifiedCoreTable(mode, "person");
  const schoolT = qualifiedCoreTable(mode, "school");
  const { clause, values } = scopeSql(scope, "ap", "s", 2);
  const { rows } = await pool.query(
    `SELECT ap.school_id, COALESCE(ap.area_id, s.area_id) AS area_id
     FROM ${personT} ap
     LEFT JOIN ${schoolT} s ON s.id = ap.school_id
     WHERE ap.id = $1 AND (${clause})`,
    [personId, ...values]
  );
  return (rows[0] as { school_id: number | null; area_id: number | null }) ?? null;
}

/** GET /workforce-events/event-types */
router.get("/workforce-events/event-types", async (req, res) => {
  try {
    if (!requireNewsAccess(req, res)) return;
    const { rows } = await pool.query(
      `SELECT id, name, description
       FROM workforce_events.event_type
       WHERE is_active = true
       ORDER BY name ASC`
    );
    res.json({
      data: rows.map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        description: r.description == null ? null : String(r.description),
      })),
    });
  } catch (e) {
    console.error("GET /workforce-events/event-types failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /workforce-events/events */
router.get("/workforce-events/events", async (req, res) => {
  try {
    const scope = requireNewsScope(req, res);
    if (scope == null) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      return;
    }

    const personT = qualifiedCoreTable(mode, "person");
    const schoolT = qualifiedCoreTable(mode, "school");
    const areaT = qualifiedCoreTable(mode, "area");

    const pageNum = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10));
    const limitNum = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10))
    );
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const scopePart = scopeSql(scope, "ap", "sch", idx);
    conditions.push(scopePart.clause);
    values.push(...scopePart.values);
    idx = scopePart.nextIdx;

    if (scope.kind === "full") {
      const schoolId = numOrNull(req.query.school_id);
      if (schoolId != null) {
        conditions.push(`ap.school_id = $${idx}`);
        values.push(schoolId);
        idx++;
      }
      const areaId = numOrNull(req.query.area_id);
      if (areaId != null) {
        conditions.push(`COALESCE(ap.area_id, sch.area_id) = $${idx}`);
        values.push(areaId);
        idx++;
      }
    }

    const personIdFilter = numOrNull(req.query.person_id);
    if (personIdFilter != null) {
      conditions.push(`e.person_id = $${idx}`);
      values.push(personIdFilter);
      idx++;
    }

    const eventTypeId = numOrNull(req.query.event_type_id);
    if (eventTypeId != null) {
      conditions.push(`e.event_type_id = $${idx}`);
      values.push(eventTypeId);
      idx++;
    }

    const status =
      typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
    if (status && EVENT_STATUSES.has(status)) {
      conditions.push(`e.status = $${idx}`);
      values.push(status);
      idx++;
    }

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      conditions.push(
        `(ap.full_name ILIKE $${idx} OR ap.document ILIKE $${idx} OR e.observation ILIKE $${idx})`
      );
      values.push(`%${search}%`);
      idx++;
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM workforce_events.event e
       JOIN workforce_events.event_type et ON et.id = e.event_type_id
       JOIN ${personT} ap ON ap.id = e.person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       ${whereSql}`,
      values
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const listValues = [...values, limitNum, offset];
    const { rows } = await pool.query(
      `SELECT
         e.id,
         e.event_type_id,
         et.name AS event_type_name,
         e.observation,
         e.status,
         ${EVENT_SCHEDULE_SQL},
         e.created_at,
         e.updated_at,
         e.person_id,
         ap.full_name AS person_name,
         ap.document AS person_document,
         ap.school_id AS person_school_id,
         sch.name AS person_school_name,
         ar.name AS person_area_name,
         e.created_by_person_id,
         cb.full_name AS created_by_name
       FROM workforce_events.event e
       JOIN workforce_events.event_type et ON et.id = e.event_type_id
       JOIN ${personT} ap ON ap.id = e.person_id
       JOIN ${personT} cb ON cb.id = e.created_by_person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       LEFT JOIN ${areaT} ar ON ar.id = COALESCE(ap.area_id, sch.area_id)
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      listValues
    );

    res.json({
      data: rows.map((r) => mapEventRow(r as Record<string, unknown>)),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 0,
      },
    });
  } catch (e) {
    console.error("GET /workforce-events/events failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /workforce-events/events/:id */
router.get("/workforce-events/events/:id", async (req, res) => {
  try {
    const scope = requireNewsScope(req, res);
    if (scope == null) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const personT = qualifiedCoreTable(mode, "person");
    const schoolT = qualifiedCoreTable(mode, "school");
    const areaT = qualifiedCoreTable(mode, "area");
    const eventId = String(req.params.id).trim();

    const scopePart = scopeSql(scope, "ap", "sch", 2);
    const { rows } = await pool.query(
      `SELECT
         e.id,
         e.event_type_id,
         et.name AS event_type_name,
         e.observation,
         e.status,
         ${EVENT_SCHEDULE_SQL},
         e.created_at,
         e.updated_at,
         e.person_id,
         ap.full_name AS person_name,
         ap.document AS person_document,
         ap.school_id AS person_school_id,
         sch.name AS person_school_name,
         ar.name AS person_area_name,
         e.created_by_person_id,
         cb.full_name AS created_by_name
       FROM workforce_events.event e
       JOIN workforce_events.event_type et ON et.id = e.event_type_id
       JOIN ${personT} ap ON ap.id = e.person_id
       JOIN ${personT} cb ON cb.id = e.created_by_person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       LEFT JOIN ${areaT} ar ON ar.id = COALESCE(ap.area_id, sch.area_id)
       WHERE e.id = $1::uuid AND (${scopePart.clause})`,
      [eventId, ...scopePart.values]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(mapEventRow(rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error("GET /workforce-events/events/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /workforce-events/events */
router.post("/workforce-events/events", async (req, res) => {
  try {
    const scope = requireNewsScope(req, res);
    if (scope == null) return;

    const createdBy = orbitPersonIdFromRequest(req);
    if (createdBy == null) {
      res.status(401).json({ error: "Se requiere autenticación" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE no disponible" });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const eventTypeId = numOrNull(b.event_type_id ?? b.eventTypeId);
    const personId = numOrNull(
      b.person_id ?? b.personId
    );

    if (eventTypeId == null || personId == null) {
      res.status(400).json({
        error: "event_type_id y person_id son obligatorios",
      });
      return;
    }

    const schedule = normalizeSchedulePayload(b);
    if ("error" in schedule) {
      res.status(400).json({ error: schedule.error });
      return;
    }

    let status =
      typeof b.status === "string" ? b.status.trim().toUpperCase() : "NOT_TAKEN";
    if (!EVENT_STATUSES.has(status)) status = "NOT_TAKEN";

    const typeCheck = await pool.query(
      `SELECT id FROM workforce_events.event_type
       WHERE id = $1 AND is_active = true`,
      [eventTypeId]
    );
    if (typeCheck.rows.length === 0) {
      res.status(400).json({ error: "Tipo de novedad inválido" });
      return;
    }

    const inScope = await fetchPersonInScope(
      personId,
      scope,
      mode
    );
    if (inScope == null) {
      res.status(404).json({ error: "Persona no encontrada o fuera de alcance" });
      return;
    }

    const observation =
      typeof b.observation === "string" && b.observation.trim() !== ""
        ? b.observation.trim()
        : null;

    const hasSchedule =
      schedule.start_date != null ||
      schedule.end_date != null ||
      schedule.start_time != null ||
      schedule.end_time != null;
    if (!observation && !hasSchedule) {
      res.status(400).json({
        error:
          "Indique la observación de la novedad o al menos una fecha u hora de inicio/fin",
      });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO workforce_events.event (
         event_type_id,
         observation,
         created_by_person_id,
         person_id,
         start_date,
         end_date,
         start_time,
         end_time,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        eventTypeId,
        observation,
        createdBy,
        personId,
        schedule.start_date,
        schedule.end_date,
        schedule.start_time,
        schedule.end_time,
        status,
      ]
    );

    const newId = String(rows[0]?.id);

    await insertEventStatusLog({
      eventId: newId,
      previousStatus: null,
      newStatus: status,
      changedByPersonId: createdBy,
    });

    const personT = qualifiedCoreTable(mode, "person");
    const schoolT = qualifiedCoreTable(mode, "school");
    const areaT = qualifiedCoreTable(mode, "area");
    const scopePart = scopeSql(scope, "ap", "sch", 2);
    const detail = await pool.query(
      `SELECT
         e.id,
         e.event_type_id,
         et.name AS event_type_name,
         e.observation,
         e.status,
         ${EVENT_SCHEDULE_SQL},
         e.created_at,
         e.updated_at,
         e.person_id,
         ap.full_name AS person_name,
         ap.document AS person_document,
         ap.school_id AS person_school_id,
         sch.name AS person_school_name,
         ar.name AS person_area_name,
         e.created_by_person_id,
         cb.full_name AS created_by_name
       FROM workforce_events.event e
       JOIN workforce_events.event_type et ON et.id = e.event_type_id
       JOIN ${personT} ap ON ap.id = e.person_id
       JOIN ${personT} cb ON cb.id = e.created_by_person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       LEFT JOIN ${areaT} ar ON ar.id = COALESCE(ap.area_id, sch.area_id)
       WHERE e.id = $1::uuid AND (${scopePart.clause})`,
      [newId, ...scopePart.values]
    );

    res.status(201).json(mapEventRow(detail.rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error("POST /workforce-events/events failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /workforce-events/events/:id/status-log */
router.get("/workforce-events/events/:id/status-log", async (req, res) => {
  try {
    const scope = requireNewsScope(req, res);
    if (scope == null) return;

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({ data: [] });
      return;
    }

    const eventId = String(req.params.id).trim();
    const personT = qualifiedCoreTable(mode, "person");
    const schoolT = qualifiedCoreTable(mode, "school");
    const scopePart = scopeSql(scope, "ap", "sch", 2);

    const allowed = await pool.query(
      `SELECT e.id
       FROM workforce_events.event e
       JOIN ${personT} ap ON ap.id = e.person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       WHERE e.id = $1::uuid AND (${scopePart.clause})`,
      [eventId, ...scopePart.values]
    );
    if (allowed.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT
         l.id,
         l.event_id,
         l.previous_status,
         l.new_status,
         l.changed_at,
         l.changed_by_person_id,
         p.full_name AS changed_by_name
       FROM workforce_events.event_status_log l
       JOIN ${personT} p ON p.id = l.changed_by_person_id
       WHERE l.event_id = $1::uuid
       ORDER BY l.changed_at DESC, l.id DESC`,
      [eventId]
    );

    res.json({
      data: rows.map((r) => mapStatusLogRow(r as Record<string, unknown>)),
    });
  } catch (e) {
    console.error("GET /workforce-events/events/:id/status-log failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /workforce-events/events/:id — solo actualiza `status` y registra log. */
router.patch("/workforce-events/events/:id", async (req, res) => {
  try {
    const scope = requireNewsScope(req, res);
    if (scope == null) return;

    const changedBy = orbitPersonIdFromRequest(req);
    if (changedBy == null) {
      res.status(401).json({ error: "Se requiere autenticación" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE no disponible" });
      return;
    }

    const eventId = String(req.params.id).trim();
    const personT = qualifiedCoreTable(mode, "person");
    const schoolT = qualifiedCoreTable(mode, "school");
    const scopePart = scopeSql(scope, "ap", "sch", 2);

    const b = req.body as Record<string, unknown>;
    const disallowedKeys = [
      "observation",
      "event_type_id",
      "eventTypeId",
      "person_id",
      "personId",
      "start_date",
      "startDate",
      "end_date",
      "endDate",
      "start_time",
      "startTime",
      "end_time",
      "endTime",
      "fecha_inicio",
      "fecha_fin",
      "hora_inicio",
      "hora_fin",
      "quantity",
      "quantity_unit",
      "quantityUnit",
    ];
    for (const key of disallowedKeys) {
      if (b[key] !== undefined) {
        res.status(400).json({
          error: "Solo se puede editar el estado de la novedad",
        });
        return;
      }
    }

    if (b.status === undefined) {
      res.status(400).json({ error: "El campo status es obligatorio" });
      return;
    }

    const newStatus =
      typeof b.status === "string" ? b.status.trim().toUpperCase() : "";
    if (!EVENT_STATUSES.has(newStatus)) {
      res.status(400).json({ error: "status inválido" });
      return;
    }

    const existing = await pool.query(
      `SELECT e.id, e.status
       FROM workforce_events.event e
       JOIN ${personT} ap ON ap.id = e.person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       WHERE e.id = $1::uuid AND (${scopePart.clause})`,
      [eventId, ...scopePart.values]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const previousStatus = String(existing.rows[0].status);

    if (previousStatus !== newStatus) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE workforce_events.event SET status = $1 WHERE id = $2::uuid`,
          [newStatus, eventId]
        );
        await client.query(
          `INSERT INTO workforce_events.event_status_log (
             event_id, previous_status, new_status, changed_by_person_id
           ) VALUES ($1::uuid, $2, $3, $4)`,
          [eventId, previousStatus, newStatus, changedBy]
        );
        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    }

    const areaT = qualifiedCoreTable(mode, "area");
    const detail = await pool.query(
      `SELECT
         e.id,
         e.event_type_id,
         et.name AS event_type_name,
         e.observation,
         e.status,
         ${EVENT_SCHEDULE_SQL},
         e.created_at,
         e.updated_at,
         e.person_id,
         ap.full_name AS person_name,
         ap.document AS person_document,
         ap.school_id AS person_school_id,
         sch.name AS person_school_name,
         ar.name AS person_area_name,
         e.created_by_person_id,
         cb.full_name AS created_by_name
       FROM workforce_events.event e
       JOIN workforce_events.event_type et ON et.id = e.event_type_id
       JOIN ${personT} ap ON ap.id = e.person_id
       JOIN ${personT} cb ON cb.id = e.created_by_person_id
       LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
       LEFT JOIN ${areaT} ar ON ar.id = COALESCE(ap.area_id, sch.area_id)
       WHERE e.id = $1::uuid`,
      [eventId]
    );

    res.json(mapEventRow(detail.rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error("PATCH /workforce-events/events/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
