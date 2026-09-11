import { Router } from "express";
import { pool } from "../../db/connection";
import { orbitPersonIdFromRequest } from "../../middleware/orbitAuth";
import { resolveCoreSchemaMode } from "../../lib/coreSchema";
import {
  insertVacancyChangeLog,
  loadVacancyAuditSnapshot,
} from "../../lib/vacancies/auditLog";
import { mapListRow, mapVacancyRow } from "../../lib/vacancies/mappers";
import { loadOperationNotesForVacancy } from "../../lib/vacancies/notes";
import {
  loadVacancyCounters,
  loadVacancyRow,
  resolveVacancyUuidFromParam,
  vacancyEditGate,
} from "../../lib/vacancies/repository";
import {
  CLOSE_STATUSES,
  FULLY_LOCKED_STATUSES,
  hiredQuantityRangeError,
  isConfirmTextValid,
  numOrUndef,
  OPERATION_STATUSES,
  resolveHiredQuantityForHired,
  VACANCY_FULLY_LOCKED_MESSAGE,
} from "../../lib/vacancies/rules";
import {
  denyIfVacancyOutOfSchoolScope,
  denyUnlessVacancyAdmin,
  requireCoreSchema,
  route,
} from "./guards";

const router = Router();

/** PATCH /vacancies/:id/close — cierre operativo por el dueño de la vacante. */
router.patch(
  "/vacancies/:id/close",
  route("PATCH /vacancies/:id/close", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const b = (req.body ?? {}) as Record<string, unknown>;
    const statusIn =
      typeof b.operationStatus === "string" ? b.operationStatus.trim() : "closed";

    if (!CLOSE_STATUSES.has(statusIn)) {
      res.status(400).json({
        error:
          "Estado final no válido: operationStatus debe ser hired, closed, cancelled o cancelled_by_capital.",
      });
      return;
    }

    const current = await loadVacancyCounters(id);
    if (current == null) {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    let hiredQuantityToSet: number | undefined;
    if (statusIn === "hired") {
      const resolved = resolveHiredQuantityForHired({
        incoming: numOrUndef(b.hiredQuantity),
        previousStatus: current.operationStatus,
        currentHired: current.hiredQuantity,
        currentQuantity: current.quantity,
      });
      if (!resolved.ok) {
        res.status(400).json({ error: resolved.error });
        return;
      }
      hiredQuantityToSet = resolved.value;
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

    const updates = [`operation_status = $1`, `closed_at = now()`];
    const values: unknown[] = [statusIn];
    if (hiredQuantityToSet !== undefined) {
      updates.push(`hired_quantity = $${values.length + 1}`);
      values.push(hiredQuantityToSet);
    }
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE vacancies.vacancy
       SET ${updates.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    const snapshot = await loadVacancyAuditSnapshot(id);
    await insertVacancyChangeLog(
      pool,
      id,
      "UPDATE",
      { operationStatus: statusIn, actionType: "close" },
      { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
    );

    const notes =
      mode != null ? await loadOperationNotesForVacancy(id, mode) : [];
    res.json(mapVacancyRow(rows[0] as Record<string, unknown>, notes));
  })
);

/** PATCH /vacancies/:id/admin-status — cambio de estado forzado (rol 38) */
router.patch(
  "/vacancies/:id/admin-status",
  route("PATCH /vacancies/:id/admin-status", async (req, res) => {
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
        error: "Debe escribir CONFIRMAR en confirmText para cambiar el estado.",
      });
      return;
    }

    const statusIn = String(b.operationStatus ?? "").trim();
    if (!OPERATION_STATUSES.has(statusIn)) {
      res.status(400).json({ error: "Invalid operationStatus" });
      return;
    }

    const current = await loadVacancyCounters(id);
    if (current == null) {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }

    let hiredQuantityToSet: number | undefined;
    if (statusIn === "hired") {
      const resolved = resolveHiredQuantityForHired({
        incoming: numOrUndef(b.hiredQuantity),
        previousStatus: current.operationStatus,
        currentHired: current.hiredQuantity,
        currentQuantity: current.quantity,
      });
      if (!resolved.ok) {
        res.status(400).json({ error: resolved.error });
        return;
      }
      hiredQuantityToSet = resolved.value;
    } else if (b.hiredQuantity !== undefined) {
      const incoming = numOrUndef(b.hiredQuantity);
      if (incoming === undefined) {
        res.status(400).json({ error: "hiredQuantity inválido." });
        return;
      }
      const rangeErr = hiredQuantityRangeError(incoming, current.quantity);
      if (rangeErr != null) {
        res.status(400).json({ error: rangeErr });
        return;
      }
      hiredQuantityToSet = incoming;
    }

    const updates: string[] = [`operation_status = $1`];
    const values: unknown[] = [statusIn];
    if (hiredQuantityToSet !== undefined) {
      updates.push(`hired_quantity = $${values.length + 1}`);
      values.push(hiredQuantityToSet);
    }
    if (FULLY_LOCKED_STATUSES.has(statusIn)) {
      updates.push(`closed_at = COALESCE(closed_at, now())`);
    }
    values.push(id);

    const core = await requireCoreSchema(res);
    if (core == null) return;

    await pool.query(
      `UPDATE vacancies.vacancy SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    const snapshot = await loadVacancyAuditSnapshot(id);
    await insertVacancyChangeLog(
      pool,
      id,
      "UPDATE",
      {
        actionType: "admin_status_change",
        previousOperationStatus: current.operationStatus,
        operationStatus: statusIn,
      },
      { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
    );

    const row = await loadVacancyRow(core.tables, id);
    res.json(mapListRow(row as Record<string, unknown>));
  })
);

export default router;
