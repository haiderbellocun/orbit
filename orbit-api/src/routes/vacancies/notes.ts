import { Router } from "express";
import { pool } from "../../db/connection";
import { orbitPersonIdFromRequest } from "../../middleware/orbitAuth";
import { toUpperAscii } from "../../lib/textNormalize";
import {
  insertVacancyChangeLog,
  loadVacancyAuditSnapshot,
} from "../../lib/vacancies/auditLog";
import { mapOperationNoteRow } from "../../lib/vacancies/mappers";
import {
  insertOperationNote,
  loadPersonFullName,
} from "../../lib/vacancies/notes";
import {
  resolveVacancyUuidFromParam,
  vacancyEditGate,
} from "../../lib/vacancies/repository";
import { VACANCY_FULLY_LOCKED_MESSAGE } from "../../lib/vacancies/rules";
import {
  denyIfVacancyOutOfSchoolScope,
  requireCoreSchema,
  route,
} from "./guards";

const router = Router();

/** POST /vacancies/:id/operation-notes */
router.post(
  "/vacancies/:id/operation-notes",
  route("POST /vacancies/:id/operation-notes", async (req, res) => {
    const id = await resolveVacancyUuidFromParam(req.params.id);
    if (id == null) {
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

    const core = await requireCoreSchema(res);
    if (core == null) return;

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
    const inserted = await insertOperationNote(id, text, personId);
    const createdByName =
      personId != null ? await loadPersonFullName(core.mode, personId) : null;

    const note = {
      ...mapOperationNoteRow(inserted),
      createdByPersonId: personId,
      createdByName,
    };

    const snapshot = await loadVacancyAuditSnapshot(id);
    await insertVacancyChangeLog(
      pool,
      id,
      "UPDATE",
      { operationNoteAppended: true, actionType: "operation_note" },
      { createdByPersonId: personId, snapshot }
    );

    res.status(201).json({ note });
  })
);

export default router;
