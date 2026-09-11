import { Router } from "express";
import { pool } from "../../db/connection";
import {
  orbitPersonIdFromRequest,
  schoolScopeFromRequest,
} from "../../middleware/orbitAuth";
import {
  validateDirectManagerIdentification,
  validateDocument,
} from "../../lib/dataValidators";
import { toUpperAscii, toUpperAsciiOrNull } from "../../lib/textNormalize";
import {
  insertVacancyChangeLog,
  loadVacancyAuditSnapshot,
} from "../../lib/vacancies/auditLog";
import {
  mapListRow,
  mapRequisition,
  mapStatusHistoryRow,
  mapVacancyRow,
} from "../../lib/vacancies/mappers";
import { loadOperationNotesForVacancy } from "../../lib/vacancies/notes";
import { resolveCoreSchemaMode } from "../../lib/coreSchema";
import {
  coreTables,
  loadProgramSchoolArea,
  loadSchoolArea,
  loadVacancyCounters,
  loadVacancyRow,
  resolveVacancyUuidFromParam,
  vacancyEditGate,
} from "../../lib/vacancies/repository";
import {
  directManagerIdentificationError,
  FULLY_LOCKED_STATUSES,
  hiredQuantityRangeError,
  hiredQuantityRequiredForHiredError,
  isConfirmTextValid,
  numOrUndef,
  OPERATION_STATUSES,
  VACANCY_FULLY_LOCKED_MESSAGE,
} from "../../lib/vacancies/rules";
import { notifyVacancyCreated } from "../../services/vacancyNotifyService";
import {
  denyIfVacancyOutOfSchoolScope,
  denyUnlessVacancyAdmin,
  requireCoreSchema,
  route,
} from "./guards";

const router = Router();

/** POST /vacancies */
router.post(
  "/vacancies",
  route("POST /vacancies", async (req, res) => {
    const core = await requireCoreSchema(res);
    if (core == null) return;

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

    // Un usuario con alcance de escuela hereda area y escuela de su propia escuela.
    if (schoolScope != null) {
      const schoolCtx = await loadSchoolArea(core.mode, schoolScope.schoolId);
      if (schoolCtx == null) {
        res.status(400).json({ error: "School not found or inactive" });
        return;
      }
      schoolId = schoolScope.schoolId;
      if (schoolCtx.areaId != null) areaId = schoolCtx.areaId;
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
      const ctx = await loadProgramSchoolArea(core.mode, programIdRaw);
      if (ctx == null) {
        res.status(400).json({ error: "programId not found or inactive" });
        return;
      }
      if (schoolScope != null && ctx.schoolId !== schoolScope.schoolId) {
        res.status(400).json({ error: "El programa no pertenece a tu escuela" });
        return;
      }
      programId = programIdRaw;
      schoolId = ctx.schoolId;
      if (ctx.areaId != null) areaId = ctx.areaId;
    }

    if (
      schoolScope != null &&
      (schoolId == null || schoolId !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    let directManagerIdentification: string | null = null;
    if (b.directManagerIdentification !== undefined) {
      const parsed = validateDirectManagerIdentification(
        b.directManagerIdentification
      );
      if (!parsed.ok) {
        res
          .status(400)
          .json({ error: directManagerIdentificationError(parsed.reason) });
        return;
      }
      directManagerIdentification =
        parsed.value == null ? null : toUpperAscii(parsed.value);
    }

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
      core.mode
    );
    const snapshot = await loadVacancyAuditSnapshot(vacancyId);
    await insertVacancyChangeLog(
      pool,
      vacancyId,
      "INSERT",
      { actionType: "create" },
      { createdByPersonId: personId, snapshot }
    );

    res.status(201).json(mapVacancyRow(row, operationNotes));
    void notifyVacancyCreatedFromId(vacancyId).catch((err) => {
      console.error("POST /vacancies notify failed:", err);
    });
  })
);

/** Notifica por correo la vacante recién creada (fuera del ciclo de respuesta). */
async function notifyVacancyCreatedFromId(vacancyId: string): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return;

  const raw = await loadVacancyRow(coreTables(mode), vacancyId);
  if (raw == null) return;

  await notifyVacancyCreated({
    vacancyId,
    positionName: String(raw.position_name ?? ""),
    areaName: String(raw.area_name ?? ""),
    schoolName: raw.school_name == null ? null : String(raw.school_name),
    programName: raw.program_name == null ? null : String(raw.program_name),
    quantity: Number(raw.quantity ?? 1),
    createdAt:
      raw.created_at != null
        ? new Date(raw.created_at as string | Date).toISOString()
        : new Date().toISOString(),
  });
}

/** DELETE /vacancies/:id — eliminación total (rol 38) */
router.delete(
  "/vacancies/:id",
  route("DELETE /vacancies/:id", async (req, res) => {
    if (denyUnlessVacancyAdmin(req, res)) return;

    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isConfirmTextValid(b.confirmText)) {
      res.status(400).json({
        error: "Debe escribir CONFIRMAR en confirmText para eliminar la vacante.",
      });
      return;
    }

    const snapRow = await pool.query(
      `SELECT v.*, r.req_number, r.sent_to_capital_at, r.capital_notes
       FROM vacancies.vacancy v
       LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
       WHERE v.id = $1`,
      [id]
    );
    if (snapRow.rows.length === 0) {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    const snapshot = await loadVacancyAuditSnapshot(id);
    const reqRow = snapRow.rows[0] as Record<string, unknown>;
    const requisition =
      reqRow.req_number != null
        ? {
            reqNumber: String(reqRow.req_number),
            sentToCapitalAt:
              reqRow.sent_to_capital_at == null
                ? null
                : new Date(
                    reqRow.sent_to_capital_at as string | Date
                  ).toISOString(),
            capitalNotes:
              reqRow.capital_notes == null ? null : String(reqRow.capital_notes),
          }
        : null;

    await insertVacancyChangeLog(
      pool,
      id,
      "DELETE",
      { actionType: "total_delete", requisition },
      { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
    );

    await pool.query(`DELETE FROM vacancies.vacancy WHERE id = $1`, [id]);

    res.json({ ok: true });
  })
);

/** GET /vacancies/:id */
router.get(
  "/vacancies/:id",
  route("GET /vacancies/:id", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const core = await requireCoreSchema(res);
    if (core == null) return;

    const raw = await loadVacancyRow(core.tables, id, {
      withRequisitionIds: true,
    });
    if (raw == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      ...mapListRow(raw),
      requisition: mapRequisition(raw),
      statusHistory: await loadStatusHistory(id),
    });
  })
);

/**
 * Historial de estados. Una base sin la migración `migrate:vacancies` devuelve
 * historial vacío en vez de tumbar el detalle completo.
 */
async function loadStatusHistory(vacancyId: string) {
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         previous_operation_status,
         new_operation_status,
         changed_at,
         changed_by_person_id
       FROM vacancies.vacancy_status_history
       WHERE vacancy_id = $1
       ORDER BY changed_at ASC`,
      [vacancyId]
    );
    return rows.map((r) => mapStatusHistoryRow(r as Record<string, unknown>));
  } catch (histErr) {
    if ((histErr as { code?: string }).code === "42703") {
      console.warn(
        "vacancy_status_history: column mismatch (run npm run migrate:vacancies). Returning empty statusHistory."
      );
      return [];
    }
    throw histErr;
  }
}

/** PATCH /vacancies/:id */
router.patch(
  "/vacancies/:id",
  route("PATCH /vacancies/:id", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
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

    const core = await requireCoreSchema(res);
    if (core == null) return;

    const b = req.body as Record<string, unknown>;

    const existing = await loadVacancyCounters(id);
    if (existing == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const existingQuantity = existing.quantity;
    const existingHiredQuantity = existing.hiredQuantity;
    const existingOperationStatus = existing.operationStatus || "open";

    const existingCcRow = await pool.query(
      `SELECT direct_manager_identification FROM vacancies.vacancy WHERE id = $1`,
      [id]
    );
    const existingManagerName = validateDocument(
      (existingCcRow.rows[0] as { direct_manager_identification?: unknown })
        ?.direct_manager_identification
    );

    const updates: string[] = [];
    const values: unknown[] = [];
    const setCol = (col: string, val: unknown) => {
      values.push(val);
      updates.push(`${col} = $${values.length}`);
    };

    if (b.directManagerIdentification !== undefined) {
      const parsed = validateDirectManagerIdentification(
        b.directManagerIdentification
      );
      if (!parsed.ok) {
        res
          .status(400)
          .json({ error: directManagerIdentificationError(parsed.reason) });
        return;
      }
      const incoming = parsed.value == null ? null : toUpperAscii(parsed.value);
      if (existingManagerName != null) {
        if (incoming !== existingManagerName) {
          res.status(409).json({
            error:
              "El nombre del jefe inmediato no puede modificarse una vez registrado.",
          });
          return;
        }
      } else if (incoming != null) {
        setCol("direct_manager_identification", incoming);
      }
    }

    // programId + schoolId/areaId en el mismo body no deben emitir SET duplicados.
    // programId no nulo: CORE infiere escuela (y área si la hay); se ignoran
    // schoolId/areaId explícitos. programId null: limpia el programa y aún
    // permite areaId / schoolId en la misma petición.
    if (b.programId !== undefined && b.programId !== null) {
      const pid = numOrUndef(b.programId);
      if (pid == null || Number.isNaN(pid)) {
        res.status(400).json({ error: "Invalid programId" });
        return;
      }
      const ctx = await loadProgramSchoolArea(core.mode, pid);
      if (ctx == null) {
        res.status(400).json({ error: "programId not found or inactive" });
        return;
      }
      setCol("program_id", pid);
      setCol("school_id", ctx.schoolId);
      if (ctx.areaId != null) setCol("area_id", ctx.areaId);
    } else {
      if (b.programId === null) setCol("program_id", null);
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
      const hiredForCheck =
        b.hiredQuantity !== undefined
          ? numOrUndef(b.hiredQuantity)
          : existingHiredQuantity;
      if (hiredForCheck != null && hiredForCheck > n) {
        res.status(400).json({
          error:
            "No puede reducir la cantidad solicitada por debajo de las personas ya contratadas.",
        });
        return;
      }
      setCol("quantity", n);
    }

    // Cantidad solicitada contra la que se valida `hired_quantity` en esta petición.
    const quantityForHiredCheck =
      b.quantity !== undefined
        ? (numOrUndef(b.quantity) ?? existingQuantity)
        : existingQuantity;

    if (b.hiredQuantity !== undefined) {
      const n = numOrUndef(b.hiredQuantity);
      if (n == null || n < 0) {
        res.status(400).json({
          error: "hiredQuantity debe ser un número mayor o igual a 0.",
        });
        return;
      }
      const rangeErr = hiredQuantityRangeError(n, quantityForHiredCheck);
      if (rangeErr != null) {
        res.status(400).json({ error: rangeErr });
        return;
      }
      setCol("hired_quantity", n);
    }

    if (b.operationStatus !== undefined) {
      const s = String(b.operationStatus).trim();
      if (!OPERATION_STATUSES.has(s)) {
        res.status(400).json({ error: "Invalid operationStatus" });
        return;
      }
      // Pasar a `hired` exige declarar cuántas personas se contrataron.
      if (s === "hired" && s !== existingOperationStatus) {
        const incoming = numOrUndef(b.hiredQuantity);
        if (incoming === undefined || incoming < 1) {
          res.status(400).json({ error: hiredQuantityRequiredForHiredError() });
          return;
        }
        const rangeErr = hiredQuantityRangeError(incoming, quantityForHiredCheck);
        if (rangeErr != null) {
          res.status(400).json({ error: rangeErr });
          return;
        }
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
      `UPDATE vacancies.vacancy SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const snapshot = await loadVacancyAuditSnapshot(id);
    await insertVacancyChangeLog(
      pool,
      id,
      "UPDATE",
      { actionType: "vacancy_patch", ...b },
      { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
    );

    const notes = await loadOperationNotesForVacancy(id, core.mode);
    res.json(mapVacancyRow(result.rows[0] as Record<string, unknown>, notes));
  })
);

export default router;
