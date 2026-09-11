import { Router, type Response } from "express";
import { pool } from "../../db/connection";
import { orbitPersonIdFromRequest } from "../../middleware/orbitAuth";
import { resolveCoreSchemaMode } from "../../lib/coreSchema";
import { toUpperAscii } from "../../lib/textNormalize";
import {
  insertVacancyChangeLog,
  loadVacancyAuditSnapshot,
} from "../../lib/vacancies/auditLog";
import { mapListRow } from "../../lib/vacancies/mappers";
import {
  coreTables,
  loadVacancyRow,
  requisitionEditGate,
  resolveVacancyUuidFromParam,
} from "../../lib/vacancies/repository";
import {
  FULLY_LOCKED_STATUSES,
  parseOptionalBool,
  REQ_NUMBER_TAKEN_MESSAGE,
  REQUISITION_LOCKED_MESSAGE,
  VACANCY_FULLY_LOCKED_MESSAGE,
} from "../../lib/vacancies/rules";
import { denyIfVacancyOutOfSchoolScope, route } from "./guards";

const router = Router();

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Fecha opcional; `undefined` marca un valor presente pero inválido. */
function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value == null || String(value).trim() === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function upperOrNull(value: unknown): string | null {
  return value != null && String(value).trim() !== ""
    ? toUpperAscii(String(value))
    : null;
}

/**
 * Respuesta de las rutas de requisición: la vacante completa cuando hay
 * catálogo CORE, `{ ok: true }` cuando no se puede componer el listado.
 */
async function respondWithVacancy(
  res: Response,
  vacancyId: string,
  status: 200 | 201
): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) {
    res.json({ ok: true });
    return;
  }
  const row = await loadVacancyRow(coreTables(mode), vacancyId);
  res.status(status).json(mapListRow(row as Record<string, unknown>));
}

/** POST /vacancies/:id/requisition */
router.post(
  "/vacancies/:id/requisition",
  route("POST /vacancies/:id/requisition", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const b = req.body as Record<string, unknown>;
    const reqNumber =
      typeof b.reqNumber === "string" ? upperOrNull(b.reqNumber) : null;

    const sentToCapitalAt = parseOptionalDate(b.sentToCapitalAt);
    if (sentToCapitalAt === undefined) {
      res.status(400).json({ error: "Invalid sentToCapitalAt" });
      return;
    }

    const capitalNotes = upperOrNull(b.capitalNotes);
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
        res
          .status(409)
          .json({ error: "Esta vacante ya tiene una requisición registrada." });
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
        if (isUniqueViolation(insErr)) {
          res.status(409).json({ error: REQ_NUMBER_TAKEN_MESSAGE });
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

      const snapshot = await loadVacancyAuditSnapshot(id);
      await insertVacancyChangeLog(
        client,
        id,
        "UPDATE",
        {
          actionType: "requisition_created",
          reqNumber,
          sentToCapitalAt,
          capitalNotes,
          shortlistComplied,
          pdaComplied,
          contractConditionsComplied,
          preInterviewCvComplied,
        },
        { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }

    await respondWithVacancy(res, id, 201);
  })
);

/** PATCH /vacancies/:id/requisition */
router.patch(
  "/vacancies/:id/requisition",
  route("PATCH /vacancies/:id/requisition", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (await denyIfVacancyOutOfSchoolScope(req, res, id)) return;

    const gate = await requisitionEditGate(id);
    if (gate === "missing") {
      res.status(404).json({ error: "Vacancy not found" });
      return;
    }
    if (gate === "blocked") {
      res.status(409).json({ error: REQUISITION_LOCKED_MESSAGE });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    const setCol = (col: string, value: unknown) => {
      values.push(value);
      updates.push(`${col} = $${values.length}`);
    };

    if (b.reqNumber !== undefined) {
      setCol("req_number", upperOrNull(b.reqNumber));
    }
    if (b.capitalNotes !== undefined) {
      setCol("capital_notes", upperOrNull(b.capitalNotes));
    }
    if (b.sentToCapitalAt !== undefined) {
      const parsed = parseOptionalDate(b.sentToCapitalAt);
      if (parsed === undefined) {
        res.status(400).json({ error: "Invalid sentToCapitalAt" });
        return;
      }
      setCol("sent_to_capital_at", parsed?.toISOString() ?? null);
    }
    for (const [col, key] of [
      ["shortlist_complied", "shortlistComplied"],
      ["pda_complied", "pdaComplied"],
      ["contract_conditions_complied", "contractConditionsComplied"],
      ["pre_interview_cv_complied", "preInterviewCvComplied"],
    ] as const) {
      if (b[key] !== undefined) setCol(col, parseOptionalBool(b[key]));
    }

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
         WHERE vacancy_id = $${values.length}
         RETURNING id`,
        values
      );
    } catch (updErr) {
      if (isUniqueViolation(updErr)) {
        res.status(409).json({ error: REQ_NUMBER_TAKEN_MESSAGE });
        return;
      }
      throw updErr;
    }

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Requisition not found for this vacancy" });
      return;
    }

    const snapshot = await loadVacancyAuditSnapshot(id);
    await insertVacancyChangeLog(
      pool,
      id,
      "UPDATE",
      { actionType: "requisition_patch", requisitionPatch: b },
      { createdByPersonId: orbitPersonIdFromRequest(req), snapshot }
    );

    await respondWithVacancy(res, id, 200);
  })
);

export default router;
